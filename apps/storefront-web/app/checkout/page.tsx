import { Card, Container } from "@commerce-os/ui";
import { getStorefrontDict } from "../../lib/i18n";

export default function CheckoutPage() {
  const t = getStorefrontDict().checkout;

  return (
    <Container className="py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tightish text-slate-900">{t.title}</h1>

      <ol className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {t.steps.map((step, index) => (
          <li key={step.title}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{step.title}</p>
                  <p className="text-xs text-slate-500">{step.detail}</p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card className="p-6">
        <p className="text-sm leading-relaxed text-slate-500">{t.note}</p>
      </Card>
    </Container>
  );
}
