import { z } from "zod";

const sourceDocumentShape = {
  documentVersionId: z.string().trim().min(1),
  extractedText: z.string().trim().optional(),
  images: z
    .array(
      z
        .object({
          page: z.number().int().positive(),
          mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
          base64: z.string().min(1),
        })
        .strict(),
    )
    .optional(),
  pdf: z
    .object({
      fileName: z.string().trim().min(1),
      base64: z.string().min(1),
    })
    .strict()
    .optional(),
} as const;

function requireDocumentContent(
  value: {
    extractedText?: string | undefined;
    images?: readonly unknown[] | undefined;
    pdf?: unknown | undefined;
  },
  context: z.RefinementCtx,
) {
  if (
    !value.extractedText?.trim() &&
    !value.images?.length &&
    value.pdf === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Informe texto extraído, ao menos uma imagem ou um PDF.",
    });
  }
}

export const sourceDocumentInputSchema = z
  .object(sourceDocumentShape)
  .strict()
  .superRefine(requireDocumentContent);

export const verticalizeEditalInputSchema = z
  .object({
    ...sourceDocumentShape,
    contestHints: z
      .object({
        name: z.string().trim().min(1).optional(),
        role: z.string().trim().min(1).optional(),
        area: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(requireDocumentContent);

export const extractMaterialIndexInputSchema = z
  .object({
    ...sourceDocumentShape,
    materialId: z.string().trim().min(1),
    knownPageOffset: z.number().int().optional(),
  })
  .strict()
  .superRefine(requireDocumentContent);

export const evidenceSchema = z
  .object({
    page: z.number().int().positive(),
    text: z.string().trim().min(1),
    boundingBox: z
      .object({
        x: z.number().min(0),
        y: z.number().min(0),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const namedExtractedItemSchema = z
  .object({
    originalName: z.string().trim().min(1),
    normalizedName: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();

export const verticalizationSubtopicSchema = namedExtractedItemSchema;

export const verticalizationTopicSchema = namedExtractedItemSchema.extend({
  subtopics: z.array(verticalizationSubtopicSchema),
});

export const examOptionKindSchema = z.enum([
  "cargo",
  "emprego",
  "funcao",
  "posto_trabalho",
  "perfil",
  "especialidade",
  "area",
  "area_atuacao",
  "enfase",
  "opcao",
  "codigo_opcao",
  "bloco_tematico",
  "eixo_tematico",
]);

export const examOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: examOptionKindSchema,
    label: z.string().trim().min(1),
    name: z.string().trim().min(1),
    code: z.string().trim().min(1).nullable(),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();

export const verticalizationSubjectSchema = namedExtractedItemSchema.extend({
  examOptionIds: z.array(z.string().trim().min(1)).default([]),
  topics: z.array(verticalizationTopicSchema),
});

export const verticalizationResultSchema = z
  .object({
    documentVersionId: z.string().trim().min(1),
    contest: z
      .object({
        name: z.string().trim().min(1),
        role: z.string().trim().min(1),
        area: z.string().trim().min(1),
      })
      .strict(),
    examOptions: z.array(examOptionSchema).default([]),
    subjects: z.array(verticalizationSubjectSchema).min(1),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export type Evidence = z.infer<typeof evidenceSchema>;
export type VerticalizationResult = z.infer<
  typeof verticalizationResultSchema
>;

export const materialIndexItemSchema = z
  .object({
    originalTitle: z.string().trim().min(1),
    normalizedTitle: z.string().trim().min(1),
    path: z.array(z.string().trim().min(1)).min(1),
    level: z.number().int().nonnegative(),
    startPage: z.number().int().positive(),
    endPage: z.number().int().positive(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.endPage < item.startPage) {
      context.addIssue({
        code: "custom",
        message: "endPage deve ser maior ou igual a startPage.",
        path: ["endPage"],
      });
    }
  });

export const materialIndexResultSchema = z
  .object({
    documentVersionId: z.string().trim().min(1),
    materialId: z.string().trim().min(1),
    pageOffset: z.number().int(),
    items: z.array(materialIndexItemSchema).min(1),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export type MaterialIndexResult = z.infer<typeof materialIndexResultSchema>;

export const associationSchema = z
  .object({
    syllabusPath: z.array(z.string().trim().min(1)).min(1),
    materialItems: z
      .array(
        z
          .object({
            path: z.array(z.string().trim().min(1)).min(1),
            startPage: z.number().int().positive(),
            endPage: z.number().int().positive(),
          })
          .strict(),
      ),
    relationType: z.enum([
      "direct",
      "partial",
      "broad",
      "composite",
      "contextual",
      "no_match",
    ]),
    coverage: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    justification: z.string().trim().min(1),
    needsHumanReview: z.boolean(),
  })
  .strict()
  .superRefine((association, context) => {
    if (
      association.relationType !== "no_match" &&
      association.materialItems.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Relações com cobertura exigem ao menos um item de material.",
        path: ["materialItems"],
      });
    }
    if (
      association.relationType === "no_match" &&
      association.materialItems.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Relação no_match não pode inventar itens de material.",
        path: ["materialItems"],
      });
    }
  });

export const associationResultSchema = z
  .object({
    verticalizationDocumentVersionId: z.string().trim().min(1),
    materialIndexDocumentVersionId: z.string().trim().min(1),
    associations: z.array(associationSchema),
    unmatchedSyllabusPaths: z.array(
      z.array(z.string().trim().min(1)).min(1),
    ),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export const suggestAssociationsInputSchema = z
  .object({
    verticalization: verticalizationResultSchema,
    materialIndex: materialIndexResultSchema,
  })
  .strict();

export type AssociationResult = z.infer<typeof associationResultSchema>;
export type SourceDocumentInput = z.infer<typeof sourceDocumentInputSchema>;
export type VerticalizeEditalInput = z.infer<
  typeof verticalizeEditalInputSchema
>;
export type ExtractMaterialIndexInput = z.infer<
  typeof extractMaterialIndexInputSchema
>;
export type SuggestAssociationsInput = z.infer<
  typeof suggestAssociationsInputSchema
>;
