# 0003. Money is an integer number of cents

Status: accepted.

Decision: every amount of money the code computes, stores or returns is an integer number of cents. Never a
float, never a decimal string. Rates are applied with `Math.round` on cents, once, at the end.

Why: invoices summed in floats were off by a cent and did not match the payment provider.
