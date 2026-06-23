import { Card, Container } from "@commerce-os/ui";

const steps = [
  { title: "Information", detail: "Contact & shipping address" },
  { title: "Shipping", detail: "Delivery method & rates" },
  { title: "Payment", detail: "Secure payment capture" },
];

export default function CheckoutPage() {
  return (
    <Container className="py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>

      <ol className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
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
        <p className="text-sm text-slate-500">
          Checkout is a placeholder. Real shipping, tax and payment steps will be wired to the
          checkout service in a later phase — no payment logic runs here.
        </p>
      </Card>
    </Container>
  );
}
