import { useEffect, useRef, useState } from "react";

import { useCreateCheckoutMutation, useGetBillingCatalogQuery, useGetEntitlementsQuery, type BillingPlan as BillingPlanData } from "../state.ts";

function providerMessage(error: unknown): string {
  const value = error as { data?: { message?: string } } | undefined;
  return value?.data?.message ?? "Não foi possível iniciar o checkout. Tente novamente.";
}

export function BillingPlan({ onHostedCheckout = (url: string) => window.location.assign(url), confirmationTimeoutMs = 30_000 }:
  { onHostedCheckout?: (url: string) => void; confirmationTimeoutMs?: number }) {
  const checkoutResult = new URLSearchParams(window.location.search).get("checkout");
  const [pollingExpired, setPollingExpired] = useState(false);
  const catalog = useGetBillingCatalogQuery();
  const entitlements = useGetEntitlementsQuery(undefined, { pollingInterval: checkoutResult === "success" && !pollingExpired ? 2_000 : 0 });
  const [createCheckout, checkout] = useCreateCheckoutMutation();
  const key = useRef(crypto.randomUUID());
  const [message, setMessage] = useState("");
  const active = entitlements.data?.advancedPlanning === true;

  useEffect(() => {
    if (checkoutResult !== "success" || active) return;
    const timeout = window.setTimeout(() => setPollingExpired(true), confirmationTimeoutMs);
    return () => window.clearTimeout(timeout);
  }, [checkoutResult, active, confirmationTimeoutMs]);

  const retryEntitlements = () => {
    setPollingExpired(false);
    void entitlements.refetch();
  };

  const startCheckout = async () => {
    setMessage("");
    try {
      const result = await createCheckout({ planId: "rota-pro", idempotencyKey: key.current }).unwrap();
      onHostedCheckout(result.checkoutUrl);
    } catch (error) { setMessage(providerMessage(error)); }
  };

  if (catalog.isLoading) return <section className="billing-stage" aria-labelledby="billing-title"><h1 id="billing-title">Plano de Estudo</h1><p role="status" aria-live="polite">Carregando planos…</p></section>;
  if (catalog.isError) return <section className="billing-stage" aria-labelledby="billing-title"><h1 id="billing-title">Plano de Estudo</h1><div className="billing-error" role="alert" tabIndex={-1}>Não foi possível carregar os planos. Verifique sua conexão e tente novamente.</div><button className="quiet-action" type="button" onClick={() => void catalog.refetch()}>Tentar Novamente</button></section>;
  const publishedPlans = (catalog.data ?? []).filter((candidate): candidate is BillingPlanData => candidate?.id === "rota-pro" && candidate.currency === "BRL" && Number.isSafeInteger(candidate.priceInCents) && candidate.limits !== undefined);
  if (!publishedPlans.length) return <section className="billing-stage" aria-labelledby="billing-title"><h1 id="billing-title">Plano de Estudo</h1><p className="billing-empty">Nenhum plano disponível agora. Seu trabalho salvo continua seguro; consulte novamente mais tarde.</p></section>;

  const plan = publishedPlans[0]!;
  return (
    <section className="billing-stage" aria-labelledby="billing-title">
      <header><div><p className="eyebrow">Compromisso de Estudo</p><h1 id="billing-title">{plan.name}</h1><p className="plan-version">Condições da Versão {plan.version}</p></div></header>
      <div className="billing-receipt">
        <p className="receipt-label">Condições Antes do Checkout</p>
        <div className="plan-price"><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.currency }).format(plan.priceInCents / 100)}</strong><span>por mês</span></div>
        <dl>
          <div><dt>Projetos</dt><dd>{plan.limits.activeProjects} projetos ativos</dd></div>
          <div><dt>Processamento</dt><dd>{plan.limits.aiDocumentPagesPerMonth} páginas por mês</dd></div>
          <div><dt>Renovação</dt><dd>{plan.renewsAutomatically ? "Renovação automática mensal" : "Sem renovação automática"}</dd></div>
        </dl>
        <p className="cancellation-terms">{plan.cancellationTerms}</p>
        {entitlements.isLoading || (entitlements.isFetching && entitlements.data === undefined) ? (
          <p className="billing-pending" role="status" aria-live="polite">Verificando seu acesso…</p>
        ) : entitlements.isError ? (
          <div className="billing-error" role="alert" aria-live="polite"><p>Não foi possível confirmar seu acesso. Verifique sua conexão antes de tentar uma nova compra.</p><button className="quiet-action" type="button" onClick={retryEntitlements}>Verificar Acesso Novamente</button></div>
        ) : active ? <p className="entitlement-active" role="status" aria-live="polite">Rota Pro Ativo — planejamento avançado liberado.</p> : checkoutResult === "success" ? null : (
          <button className="billing-action" type="button" disabled={checkout.isLoading} onClick={() => void startCheckout()}>{checkout.isLoading ? "Abrindo Checkout…" : "Contratar Rota Pro"}</button>
        )}
        <p className="hosted-note"><span aria-hidden="true">◆</span> Pagamento seguro no ambiente do provedor. O Planejador não recebe nem armazena número completo do cartão ou código de segurança.</p>
        {checkoutResult === "success" && !active && !entitlements.isError && !pollingExpired ? <p className="billing-pending" role="status" aria-live="polite">Pagamento recebido. Confirmando acesso… Você pode manter esta página aberta.</p> : null}
        {checkoutResult === "success" && !active && !entitlements.isError && pollingExpired ? <div className="billing-error" role="alert" aria-live="polite"><p>A confirmação está demorando mais que o esperado. Seu pagamento não será repetido.</p><button className="quiet-action" type="button" onClick={retryEntitlements}>Verificar Acesso Novamente</button></div> : null}
        {checkoutResult === "canceled" ? <p className="billing-canceled" role="status" aria-live="polite">Checkout cancelado. Nenhuma cobrança ou mudança de acesso foi confirmada.</p> : null}
        {message ? <p className="billing-error" role="alert" aria-live="polite">{message}</p> : null}
      </div>
    </section>
  );
}
