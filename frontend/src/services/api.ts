import axios from "axios";
import type {
  InstitutionalResponse,
  MajorHoldersResponse,
  StockSummary,
  TechnicalResponse
} from "../types/api";

export const api = axios.create({
  baseURL: "/api",
  timeout: 20000
});

export async function getStock(id: string): Promise<StockSummary> {
  const response = await api.get<StockSummary>(`/stock/${id}`);
  return response.data;
}

export async function getTechnical(id: string): Promise<TechnicalResponse> {
  const response = await api.get<TechnicalResponse>(`/technical/${id}`);
  return response.data;
}

export async function getInstitutional(id: string): Promise<InstitutionalResponse> {
  const response = await api.get<InstitutionalResponse>(`/institutional/${id}`);
  return response.data;
}

export async function getMajorHolders(id: string): Promise<MajorHoldersResponse> {
  const response = await api.get<MajorHoldersResponse>(`/majorholders/${id}`);
  return response.data;
}
