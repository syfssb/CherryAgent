import { api } from './api'

export interface ProviderOption {
  id: string
  label: string
}

interface ProvidersResponse {
  providers: ProviderOption[]
}

export async function fetchProviders(): Promise<ProviderOption[]> {
  const res = await api.get<ProvidersResponse>('/admin/providers')
  return res.data?.providers ?? []
}
