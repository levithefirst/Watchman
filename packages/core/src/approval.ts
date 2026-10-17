/** How each PayBox grant approval mode behaves when the protection fires, in the user's terms. */
export const APPROVAL_LABELS: Record<string, { label: string; detail: string }> = {
  autonomous: { label: "Pre-authorized", detail: "PayBox clears this swap within your grant without asking again. Signing still happens inside PayBox." },
  always_approve: { label: "Approve each time", detail: "When the protection triggers, PayBox asks you to approve the swap with your passkey before anything moves." },
  iframe: { label: "Approve each time", detail: "When the protection triggers, PayBox asks you to approve and sign in its window before anything moves." },
  paybox: { label: "Approve in PayBox", detail: "When the protection triggers, PayBox asks you to approve the swap in the PayBox app before anything moves." },
};
