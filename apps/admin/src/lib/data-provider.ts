import type { DataProvider, GetListParams } from "ra-core";
import { apiFetch } from "@/lib/api";

/** The homepage numbers (`GET /api/admin/stats`). */
export type AdminStats = {
  bands: number;
  newBandsThisMonth: number;
  users: number;
  activeUsers: number;
  songs: number;
  documents: number;
  documentsBytes: number;
  /** Every band's documents budget added up. */
  documentsQuotaBytes: number;
  pendingInvitations: number;
};

/**
 * A list's query string for `GET /api/admin/<resource>`: `page` and `perPage` (from 1), `sort` and
 * `order` (`asc` or `desc`), then the filters as they are (`q` for a search).
 */
export function listQuery({ pagination, sort, filter }: Partial<GetListParams>) {
  const params = new URLSearchParams();
  if (pagination) {
    params.set("page", String(pagination.page));
    params.set("perPage", String(pagination.perPage));
  }
  if (sort?.field) {
    params.set("sort", sort.field);
    params.set("order", sort.order.toLowerCase());
  }
  for (const [key, value] of Object.entries(filter ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

const notYet = (method: string) => () =>
  Promise.reject(new Error(`${method} isn't available in the admin API yet`));

/**
 * react-admin's data access, on our own admin routes (#246) rather than a generic REST format:
 * a list answers `{ data, total }`, a record `{ data }`. Writes come with the features needing them.
 */
export const dataProvider = {
  getList: (resource, params) => apiFetch(`/api/admin/${resource}?${listQuery(params)}`),
  getOne: (resource, { id }) => apiFetch(`/api/admin/${resource}/${encodeURIComponent(id)}`),
  getMany: notYet("getMany"),
  getManyReference: notYet("getManyReference"),
  create: notYet("create"),
  update: notYet("update"),
  updateMany: notYet("updateMany"),
  /** Deleting asks for what the API needs to confirm it in `meta` (a band's name, #248). */
  delete: (resource, { id, meta }) =>
    apiFetch(`/api/admin/${resource}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify(meta ?? {}),
    }),
  deleteMany: notYet("deleteMany"),
  /** The homepage numbers. */
  stats: () => apiFetch<AdminStats>("/api/admin/stats"),
  /** Suspends a band, or makes it active again (#248). */
  setBandStatus: (id: string, status: "disable" | "enable") =>
    apiFetch(`/api/admin/bands/${encodeURIComponent(id)}/${status}`, { method: "POST" }),
} satisfies DataProvider & Record<string, unknown>;

export type AdminDataProvider = typeof dataProvider;
