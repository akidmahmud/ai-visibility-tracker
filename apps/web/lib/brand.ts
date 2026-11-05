import { api } from "./api";

export type Brand = {
  id: string;
  name: string;
  domain: string;
  entityId: string | null;
  frequency: string;
  enabledModels: string[];
  nextRunAt: string | null;
  lastManualRunAt: string | null;
};
export type Competitor = { id: string; entityId: string; entity: { canonicalName: string; domain: string | null } };

export const getBrand = (id: string) => api<Brand>(`/brands/${id}`);
export const getCompetitors = (id: string) => api<Competitor[]>(`/brands/${id}/competitors`);

/** Fixed color order for charts: the brand, then tracked competitors in the order they were added. */
export const colorOrder = (brand: Brand, competitors: Competitor[]) =>
  [brand.entityId, ...competitors.map((c) => c.entityId)].filter((id): id is string => !!id);
