export async function POST(request: Request) {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const price = process.env.STRIPE_PRICE_ID?.trim();
  if (!key || !price) {
    return Response.json(
      { error: "Add STRIPE_SECRET_KEY in web/.env.local, then restart the site." },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const success = `${origin}/?donated=1#support-title`;
  const cancel = `${origin}/#support-title`;

  const payment = await openSession(key, price, "payment", success, cancel);
  const session =
    payment.ok || !payment.recurring
      ? payment
      : await openSession(key, price, "subscription", success, cancel);

  if (!session.ok || !session.url) {
    return Response.json(
      { error: session.message || "Stripe could not open checkout." },
      { status: 502 },
    );
  }

  return Response.json({ url: session.url });
}

async function openSession(
  key: string,
  price: string,
  mode: "payment" | "subscription",
  success: string,
  cancel: string,
): Promise<{ ok: boolean; url?: string; message?: string; recurring?: boolean }> {
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode,
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        success_url: success,
        cancel_url: cancel,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json()) as {
      url?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const message = body.error?.message ?? "Stripe could not open checkout.";
      return { ok: false, message, recurring: /recurring|subscription/i.test(message) };
    }
    return { ok: true, url: body.url };
  } catch {
    return { ok: false, message: "Stripe could not be reached." };
  }
}
