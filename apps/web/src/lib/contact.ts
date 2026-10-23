import type { ContactSubject, Language } from "@coverband/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/errors";

/** Whether the contact form is offered (#234): the server has a recipient for it. */
export const contactQuery = queryOptions({
  queryKey: ["contact"],
  // The server's setting: it only changes with a deploy.
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: async () => (await (await ensureOk(await api.contact.$get())).json()).available,
});

/** Sends a message to the app's team. */
export async function sendContact(json: {
  subject: ContactSubject;
  message: string;
  page?: string;
  language: Language;
}) {
  await ensureOk(await api.contact.$post({ json }));
}
