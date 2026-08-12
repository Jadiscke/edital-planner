import "reflect-metadata";
import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Injectable,
  HttpCode,
  HttpException,
  HttpStatus,
  Module,
  NotFoundException,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { createMaterialSchema, createProjectApiDocument, createProjectSchema, importMaterialIndexSchema, reviseMaterialIndexSchema, toFieldErrors, updateProjectSchema } from "@planejador/contracts";
import {
  ProjectNotFoundError,
  ProjectService,
  type IdentityContext,
  type Project,
  type ProjectInput,
  type ProjectRepository,
} from "../../../packages/domain/src/projects.ts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MembershipResolver } from "./authorization.ts";
import type { TestEditalCatalog } from "./test-editals.ts";
import {
  DocumentRejectedError,
  type DocumentPipeline,
} from "../../../packages/domain/src/documents.ts";
import { InMemoryVerticalizationRepository, type VerticalizationRepository } from "../../../packages/domain/src/verticalizations.ts";
import { InMemoryMaterialRepository, MaterialIndexService, MaterialNotFoundError, MaterialVersionInvalidError, type MaterialIndexItem, type MaterialRepository } from "../../../packages/domain/src/materials.ts";
import { InMemoryMaterialIndexProcessingPipeline, type MaterialIndexExtractor, type MaterialIndexProcessingPipeline } from "./material-index-processing.ts";
export type { MaterialIndexExtractor } from "./material-index-processing.ts";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  flowCookie,
  readCookie,
  sessionCookie,
  type SessionStore,
} from "./sessions.ts";

export interface AccessIdentity extends IdentityContext {
  issuer: string;
  upstreamSessionId?: string;
}

export interface VerifiedTokenIdentity {
  issuer: string;
  subjectId: string;
  requestedTenantId: string;
  upstreamSessionId?: string;
}

export type VerifyAccessToken = (accessToken: string) => Promise<VerifiedTokenIdentity>;

export interface BffAuthenticator {
  begin(returnTo: string, clientKey: string): Promise<{ authorizationUrl: string; flowId: string }>;
  complete(input: { code: string; state: string; flowId: string }): Promise<{ identity: VerifiedTokenIdentity; returnTo: string }>;
}

interface AuthenticatedRequest extends FastifyRequest {
  identity: AccessIdentity;
}

interface AuthenticationOptions {
  sessions: SessionStore;
  memberships: MembershipResolver;
  bff?: BffAuthenticator;
  secureCookies: boolean;
  allowedOrigins: readonly string[];
  testIdentity?: AccessIdentity;
  resetTestState?: () => void | Promise<void>;
}

class LoginRateLimiter {
  private readonly clients = new Map<string, { count: number; resetsAt: number }>();
  assertAllowed(clientKey: string): void {
    const now = Date.now();
    const current = this.clients.get(clientKey);
    if (!current || current.resetsAt <= now) {
      this.clients.set(clientKey, { count: 1, resetsAt: now + 60_000 });
      return;
    }
    if (current.count >= 10) throw new HttpException("Muitas tentativas de login. Aguarde um minuto.", HttpStatus.TOO_MANY_REQUESTS);
    current.count += 1;
    if (this.clients.size > 10_000) for (const [key, entry] of this.clients) if (entry.resetsAt <= now) this.clients.delete(key);
  }
}

const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
const DOCUMENT_PIPELINE = Symbol("DOCUMENT_PIPELINE");
const VERTICALIZATION_REPOSITORY = Symbol("VERTICALIZATION_REPOSITORY");
const MATERIAL_REPOSITORY = Symbol("MATERIAL_REPOSITORY");
const MATERIAL_INDEX_PIPELINE = Symbol("MATERIAL_INDEX_PIPELINE");
const TEST_EDITAL_CATALOG = Symbol("TEST_EDITAL_CATALOG");
const VERIFY_ACCESS_TOKEN = Symbol("VERIFY_ACCESS_TOKEN");
const AUTH_OPTIONS = Symbol("AUTH_OPTIONS");
const OPENAPI_DOCUMENT = Symbol("OPENAPI_DOCUMENT");

@Injectable()
class OidcGuard implements CanActivate {
  constructor(
    @Inject(VERIFY_ACCESS_TOKEN) private readonly verifyAccessToken: VerifyAccessToken,
    @Inject(AUTH_OPTIONS) private readonly authentication: AuthenticationOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      const authorization = request.headers.authorization;
      if (authorization?.startsWith("Bearer ")) {
        request.identity = await this.authentication.memberships.resolve(
          await this.verifyAccessToken(authorization.slice("Bearer ".length)),
        );
      } else {
        const sessionId = readCookie(request.headers.cookie, SESSION_COOKIE);
        const session = sessionId ? await this.authentication.sessions.find(sessionId) : undefined;
        if (!session) throw new Error("Session missing");
        if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method)) this.assertOrigin(request);
        try {
          request.identity = await this.authentication.memberships.resolve({ issuer: session.identity.issuer, subjectId: session.identity.subjectId,
            requestedTenantId: session.identity.tenantId, ...(session.identity.upstreamSessionId ? { upstreamSessionId: session.identity.upstreamSessionId } : {}) });
        } catch (error) {
          if (sessionId) await this.authentication.sessions.revoke(sessionId);
          throw error;
        }
      }
      const requestCorrelationId = request.headers["x-request-id"];
      request.identity = { ...request.identity, correlationId: typeof requestCorrelationId === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestCorrelationId) ? requestCorrelationId : randomUUID() };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException("Use uma sessão válida.");
    }
  }

  private assertOrigin(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (!origin || !this.authentication.allowedOrigins.includes(origin)) {
      throw new ForbiddenException("A origem da solicitação não é permitida.");
    }
  }
}

function publicProject(project: Project) {
  const { tenantId: _tenantId, createdBy: _createdBy, ...safeProject } = project;
  return safeProject;
}

@Controller("projects")
@UseGuards(OidcGuard)
class ProjectsController {
  private readonly projects: ProjectService;

  constructor(@Inject(PROJECT_REPOSITORY) repository: ProjectRepository) {
    this.projects = new ProjectService(repository);
  }

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query("status") status?: string) {
    if (status !== undefined && status !== "active" && status !== "archived") {
      throw new BadRequestException("Use status active ou archived.");
    }
    return (await this.projects.list(request.identity, status ?? "active")).map(publicProject);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException({
        message: "Informe uma chave de idempotência válida.",
        fieldErrors: { idempotencyKey: "Use uma chave com pelo menos 8 caracteres." },
      });
    }
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Revise os campos destacados.", fieldErrors: toFieldErrors(parsed.error) });
    }
    return publicProject(await this.projects.create(request.identity, parsed.data, idempotencyKey));
  }

  @Post(":projectId/archive")
  @HttpCode(200)
  async archive(@Req() request: AuthenticatedRequest, @Param("projectId") projectId: string) {
    try {
      return publicProject(await this.projects.archive(request.identity, projectId));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) throw new NotFoundException("Projeto não encontrado.");
      throw error;
    }
  }

  @Post(":projectId/duplicates")
  async duplicate(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException("Informe uma chave de idempotência válida.");
    }
    try {
      return publicProject(await this.projects.duplicate(request.identity, projectId, idempotencyKey));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) throw new NotFoundException("Projeto não encontrado.");
      throw error;
    }
  }

  @Patch(":projectId")
  async update(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const projectId = (request.params as { projectId: string }).projectId;
    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Revise os campos destacados.", fieldErrors: toFieldErrors(parsed.error) });
    }
    try {
      const updates = Object.fromEntries(Object.entries(parsed.data).filter((entry) => entry[1] !== undefined)) as Partial<ProjectInput>;
      return publicProject(await this.projects.update(request.identity, projectId, updates));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) throw new NotFoundException("Projeto não encontrado.");
      throw error;
    }
  }
}

@Controller()
@UseGuards(OidcGuard)
class DocumentsController {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(DOCUMENT_PIPELINE) private readonly documents: DocumentPipeline,
    @Inject(MATERIAL_INDEX_PIPELINE) private readonly materialIndexes: MaterialIndexProcessingPipeline | undefined,
  ) {}

  @Post("projects/:projectId/editais")
  async upload(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("content-disposition") contentDisposition: string | undefined,
    @Headers("x-processing-mode") processingMode: string | undefined,
    @Body() body: Buffer,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8) throw new BadRequestException("Informe uma chave de idempotência válida.");
    const project = (await this.projects.list(request.identity)).find((candidate) => candidate.id === projectId);
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    const filename = /filename="?([^";]+)"?/i.exec(contentDisposition ?? "")?.[1] ?? "edital.pdf";
    if (processingMode !== undefined && processingMode !== "fixture" && processingMode !== "full") {
      throw new BadRequestException("Use o modo de processamento fixture ou full.");
    }
    try {
      return await this.documents.upload({
        identity: request.identity, projectId, idempotencyKey, filename, bytes: body,
        processingMode: processingMode ?? "full",
        contestHints: { name: project.concurso, role: project.cargo, area: project.area },
      });
    } catch (error) {
      if (error instanceof DocumentRejectedError) {
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Get("processing-jobs/:jobId")
  async status(@Req() request: AuthenticatedRequest, @Param("jobId") jobId: string) {
    const job = await this.documents.getJob(request.identity, jobId) ?? await this.materialIndexes?.getJob(request.identity, jobId);
    if (!job) throw new NotFoundException("Processamento não encontrado.");
    return job;
  }
}

@Controller("development/test-editals")
@UseGuards(OidcGuard)
class DevelopmentTestEditalsController {
  constructor(@Inject(TEST_EDITAL_CATALOG) private readonly catalog: TestEditalCatalog | undefined) {}

  @Get()
  list() {
    if (!this.catalog) throw new NotFoundException();
    return this.catalog.list();
  }

  @Get(":id")
  async download(@Param("id") id: string, @Res() reply: FastifyReply) {
    if (!this.catalog) throw new NotFoundException();
    const edital = this.catalog.list().find((candidate) => candidate.id === id);
    const bytes = edital ? await this.catalog.load(id) : undefined;
    if (!edital || !bytes) throw new NotFoundException("Edital de teste não encontrado.");
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `attachment; filename="${edital.filename}"`);
    return reply.send(bytes);
  }
}

@Controller()
@UseGuards(OidcGuard)
class VerticalizationsController {
  constructor(@Inject(VERTICALIZATION_REPOSITORY) private readonly verticalizations: VerticalizationRepository) {}

  @Get("document-versions/:documentVersionId/verticalization")
  async get(@Req() request: AuthenticatedRequest, @Param("documentVersionId") documentVersionId: string) {
    const tree = await this.verticalizations.getByDocumentVersion(request.identity, documentVersionId);
    if (!tree) throw new NotFoundException("Verticalização não encontrada.");
    const { tenantId: _tenantId, ...publicTree } = tree;
    return publicTree;
  }
}

@Controller()
@UseGuards(OidcGuard)
class MaterialsController {
  private readonly service: MaterialIndexService;
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository, @Inject(MATERIAL_REPOSITORY) repository: MaterialRepository, @Inject(MATERIAL_INDEX_PIPELINE) private readonly pipeline: MaterialIndexProcessingPipeline | undefined) { this.service = new MaterialIndexService(repository); }

  @Get("projects/:projectId/materials")
  async list(@Req() request: AuthenticatedRequest, @Param("projectId") projectId: string) {
    if (!(await this.projects.list(request.identity)).some((project) => project.id === projectId)) throw new NotFoundException("Projeto não encontrado.");
    return this.service.list(request.identity, projectId);
  }

  @Post("projects/:projectId/materials")
  async create(@Req() request: AuthenticatedRequest, @Param("projectId") projectId: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    if (!key || key.length < 8) throw new BadRequestException("Informe uma chave de idempotência válida.");
    if (!(await this.projects.list(request.identity)).some((project) => project.id === projectId)) throw new NotFoundException("Projeto não encontrado.");
    const parsed = createMaterialSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "Revise os campos destacados.", fieldErrors: toFieldErrors(parsed.error) });
    const material = await this.service.create(request.identity, { projectId, ...parsed.data }, key);
    const { tenantId: _tenantId, ...safe } = material; return safe;
  }

  @Get("materials/:materialId")
  async get(@Req() request: AuthenticatedRequest, @Param("materialId") materialId: string) {
    const material = await this.service.get(request.identity, materialId);
    if (!material) throw new NotFoundException("Material não encontrado.");
    const { tenantId: _tenantId, ...safe } = material; return safe;
  }

  @Post("materials/:materialId/index-versions")
  async importIndex(@Req() request: AuthenticatedRequest, @Param("materialId") materialId: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const idempotencyKey = this.requiredIdempotencyKey(key);
    const parsed = importMaterialIndexSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "Revise a entrada do índice.", fieldErrors: toFieldErrors(parsed.error) });
    if (parsed.data.sourceKind === "manual") return this.run(() => this.service.importIndex(request.identity, materialId, { sourceKind: "manual", pageOffset: parsed.data.pageOffset, items: parsed.data.items as MaterialIndexItem[] }, idempotencyKey));
    if (!this.pipeline) throw new ServiceUnavailableException("A extração automática está indisponível. Digite o índice ou tente novamente.");
    const sourceKind = parsed.data.sourceKind as "pdf" | "image"; const mimeType = parsed.data.mimeType!; const sourceFilename = parsed.data.sourceFilename!;
    const base64 = parsed.data.base64!; const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new UnprocessableEntityException({ code: "invalid_index_pages", message: "Envie até 5 MB somente com as páginas do índice." });
    const valid = sourceKind === "pdf" ? mimeType === "application/pdf" && bytes.subarray(0, 5).toString("latin1") === "%PDF-" : mimeType !== "application/pdf" && ({ "image/png": "89504e470d0a1a0a", "image/jpeg": "ffd8ff", "image/webp": "52494646" } as const)[mimeType]?.startsWith(bytes.subarray(0, mimeType === "image/png" ? 8 : mimeType === "image/jpeg" ? 3 : 4).toString("hex"));
    if (!valid) throw new UnprocessableEntityException({ code: "invalid_index_pages", message: "O arquivo não corresponde ao formato informado. Envie PDF, PNG, JPEG ou WebP." });
    reply.status(202);
    return this.run(() => this.pipeline!.submit({
      identity: request.identity,
      materialId,
      idempotencyKey,
      sourceKind,
      sourceFilename,
      mimeType,
      base64,
      pageOffset: parsed.data.pageOffset,
      ...(parsed.data.basedOnVersionId ? { basedOnVersionId: parsed.data.basedOnVersionId } : {}),
    }));
  }

  @Post("materials/:materialId/index-versions/:versionId/revisions")
  async revise(@Req() request: AuthenticatedRequest, @Param("materialId") materialId: string, @Param("versionId") versionId: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    const idempotencyKey = this.requiredIdempotencyKey(key);
    const parsed = reviseMaterialIndexSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "Revise os itens destacados.", fieldErrors: toFieldErrors(parsed.error) });
    const items: MaterialIndexItem[] = parsed.data.items.map(({ sourceId, ...item }) => ({ ...item, ...(sourceId ? { sourceId } : {}) }));
    return this.run(() => this.service.revise(request.identity, materialId, versionId, { pageOffset: parsed.data.pageOffset, items }, idempotencyKey));
  }

  @Post("materials/:materialId/index-versions/:versionId/approval")
  approve(@Req() request: AuthenticatedRequest, @Param("materialId") materialId: string, @Param("versionId") versionId: string, @Headers("idempotency-key") key: string | undefined) {
    return this.run(() => this.service.approve(request.identity, materialId, versionId, this.requiredIdempotencyKey(key)));
  }

  private requiredIdempotencyKey(key: string | undefined): string {
    if (!key || key.length < 8) throw new BadRequestException("Informe uma chave de idempotência válida.");
    return key;
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof MaterialNotFoundError) throw new NotFoundException("Material ou versão não encontrada.");
      if (error instanceof MaterialVersionInvalidError) throw new UnprocessableEntityException({ code: "invalid_index", message: error.message });
      throw error;
    }
  }
}

@Controller()
class ContractController {
  constructor(@Inject(OPENAPI_DOCUMENT) private readonly document: ReturnType<typeof createProjectApiDocument>) {}

  @Get("openapi.json")
  openApi() {
    return this.document;
  }
}

@Controller("auth")
class AuthenticationController {
  private readonly loginLimiter = new LoginRateLimiter();
  constructor(@Inject(AUTH_OPTIONS) private readonly authentication: AuthenticationOptions) {}

  @Get("session")
  async session(@Req() request: FastifyRequest) {
    const sessionId = readCookie(request.headers.cookie, SESSION_COOKIE);
    const session = sessionId ? await this.authentication.sessions.find(sessionId) : undefined;
    if (!session) return { authenticated: false };
    try {
      await this.authentication.memberships.resolve({ issuer: session.identity.issuer, subjectId: session.identity.subjectId, requestedTenantId: session.identity.tenantId, ...(session.identity.upstreamSessionId ? { upstreamSessionId: session.identity.upstreamSessionId } : {}) });
      return { authenticated: true, expiresAt: session.expiresAt.toISOString() };
    } catch {
      if (sessionId) await this.authentication.sessions.revoke(sessionId);
      return { authenticated: false };
    }
  }

  @Get("login")
  async login(@Query("returnTo") returnTo: string | undefined, @Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!this.authentication.bff) throw new ServiceUnavailableException("O login OIDC ainda não foi configurado.");
    this.loginLimiter.assertAllowed(request.ip);
    let login: Awaited<ReturnType<BffAuthenticator["begin"]>>;
    try { login = await this.authentication.bff.begin(this.allowedReturnTo(returnTo), request.ip); }
    catch (error) {
      if (error instanceof Error && error.message === "Too many active authorization flows") {
        throw new HttpException("Muitos fluxos de login ativos. Conclua ou aguarde a expiração.", HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
    reply.header("set-cookie", flowCookie(login.flowId, this.authentication.secureCookies, 600));
    return reply.redirect(login.authorizationUrl, 302);
  }

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!this.authentication.bff) throw new ServiceUnavailableException("O login OIDC ainda não foi configurado.");
    if (!code || !state) {
      reply.header("set-cookie", flowCookie("", this.authentication.secureCookies, 0));
      throw new BadRequestException("A resposta OIDC está incompleta.");
    }
    const flowId = readCookie(request.headers.cookie, FLOW_COOKIE);
    if (!flowId) {
      reply.header("set-cookie", flowCookie("", this.authentication.secureCookies, 0));
      throw new BadRequestException("O fluxo OIDC expirou.");
    }
    let completed: Awaited<ReturnType<BffAuthenticator["complete"]>>;
    try {
      completed = await this.authentication.bff.complete({ code, state, flowId });
    } catch {
      reply.header("set-cookie", flowCookie("", this.authentication.secureCookies, 0));
      throw new UnauthorizedException("A resposta do provedor de identidade não pôde ser validada.");
    }
    let identity: AccessIdentity;
    try { identity = await this.authentication.memberships.resolve(completed.identity); }
    catch {
      reply.header("set-cookie", flowCookie("", this.authentication.secureCookies, 0));
      throw new ForbiddenException("A conta não possui acesso ativo ao tenant solicitado.");
    }
    await this.authentication.sessions.revokeIdentity(identity.issuer, identity.subjectId);
    const sessionId = await this.authentication.sessions.create(identity, new Date(Date.now() + 60 * 60 * 1_000));
    reply.header("set-cookie", [
      sessionCookie(sessionId, this.authentication.secureCookies, 60 * 60),
      flowCookie("", this.authentication.secureCookies, 0),
    ]);
    return reply.redirect(this.allowedReturnTo(completed.returnTo), 302);
  }

  @Post("logout")
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    this.assertOrigin(request);
    const sessionId = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (sessionId) await this.authentication.sessions.revoke(sessionId);
    reply.header("set-cookie", sessionCookie("", this.authentication.secureCookies, 0));
    return reply.status(204).send();
  }

  @Post("test-session")
  async testSession(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!this.authentication.testIdentity) throw new NotFoundException();
    this.assertOrigin(request);
    await this.authentication.resetTestState?.();
    const sessionId = await this.authentication.sessions.create(
      this.authentication.testIdentity,
      new Date(Date.now() + 60 * 60 * 1_000),
    );
    reply.header("set-cookie", sessionCookie(sessionId, false, 60 * 60));
    return reply.status(204).send();
  }

  private allowedReturnTo(candidate: string | undefined): string {
    const fallback = new URL("/app/", this.authentication.allowedOrigins[0]).toString();
    if (!candidate) return fallback;
    const url = new URL(candidate, fallback);
    if (!this.authentication.allowedOrigins.includes(url.origin)) throw new BadRequestException("Destino de login inválido.");
    if (url.pathname !== "/app" && !url.pathname.startsWith("/app/")) {
      throw new BadRequestException("Destino de login inválido.");
    }
    if (url.pathname === "/app") url.pathname = "/app/";
    return url.toString();
  }

  private assertOrigin(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (!origin || !this.authentication.allowedOrigins.includes(origin)) {
      throw new ForbiddenException("A origem da solicitação não é permitida.");
    }
  }
}

export interface CreateApiOptions {
  projects: ProjectRepository;
  documents: DocumentPipeline;
  verticalizations?: VerticalizationRepository;
  materials?: MaterialRepository;
  materialIndexExtractor?: MaterialIndexExtractor;
  materialIndexPipeline?: MaterialIndexProcessingPipeline;
  verifyAccessToken: VerifyAccessToken;
  sessions: SessionStore;
  memberships: MembershipResolver;
  allowedOrigins: readonly string[];
  bff?: BffAuthenticator;
  secureCookies?: boolean;
  testIdentity?: AccessIdentity;
  resetTestState?: () => void | Promise<void>;
  testEditals?: TestEditalCatalog;
  openIdConnectUrl: string;
  trustedProxyIps: readonly string[];
}

export async function createApi(options: CreateApiOptions): Promise<FastifyInstance> {
  if (options.allowedOrigins.length === 0) throw new Error("At least one explicit web origin is required");
  if (options.secureCookies === false && options.allowedOrigins.some((origin) => {
    const hostname = new URL(origin).hostname;
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]";
  })) throw new Error("Insecure cookies are only permitted for loopback development origins");
  const authentication: AuthenticationOptions = {
    sessions: options.sessions,
    memberships: options.memberships,
    allowedOrigins: options.allowedOrigins,
    secureCookies: options.secureCookies ?? true,
    ...(options.bff ? { bff: options.bff } : {}),
    ...(options.testIdentity ? { testIdentity: options.testIdentity } : {}),
    ...(options.resetTestState ? { resetTestState: options.resetTestState } : {}),
  };
  const materialRepository = options.materials ?? new InMemoryMaterialRepository();
  const materialIndexPipeline = options.materialIndexPipeline ?? (options.materialIndexExtractor
    ? new InMemoryMaterialIndexProcessingPipeline(materialRepository, options.materialIndexExtractor)
    : undefined);

  @Module({
    controllers: [ProjectsController, DocumentsController, DevelopmentTestEditalsController, VerticalizationsController, MaterialsController, ContractController, AuthenticationController],
    providers: [
      { provide: PROJECT_REPOSITORY, useValue: options.projects },
      { provide: DOCUMENT_PIPELINE, useValue: options.documents },
      { provide: VERTICALIZATION_REPOSITORY, useValue: options.verticalizations ?? new InMemoryVerticalizationRepository() },
      { provide: MATERIAL_REPOSITORY, useValue: materialRepository },
      { provide: MATERIAL_INDEX_PIPELINE, useValue: materialIndexPipeline },
      { provide: TEST_EDITAL_CATALOG, useValue: options.testEditals },
      { provide: VERIFY_ACCESS_TOKEN, useValue: options.verifyAccessToken },
      { provide: AUTH_OPTIONS, useValue: authentication },
      { provide: OPENAPI_DOCUMENT, useValue: createProjectApiDocument(options.openIdConnectUrl) },
      OidcGuard,
    ],
  })
  class ApiModule {}

  const adapter = new FastifyAdapter({ logger: false, bodyLimit: 10 * 1024 * 1024, trustProxy: [...options.trustedProxyIps] });
  adapter.getInstance().addContentTypeParser("application/pdf", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  const app = await NestFactory.create(ApiModule, adapter, { logger: false });
  app.enableCors({
    origin: [...options.allowedOrigins],
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "content-disposition", "idempotency-key", "x-processing-mode", "x-request-id"],
    credentials: true,
    maxAge: 600,
  });
  app.enableShutdownHooks();
  await app.init();
  return adapter.getInstance();
}
