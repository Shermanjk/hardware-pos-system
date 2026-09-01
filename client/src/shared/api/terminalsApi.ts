import httpClient from "./httpClient";

export interface POSTerminal {
  id: number;
  terminal_code: string; // e.g. "TERM-01"
  terminal_name: string; // e.g. "Counter 1 (Front Desk)"
  pos_serial: string;    // e.g. "PF3QX4HD"
  pos_min: string;       // e.g. "0000-932749901"
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTerminalPayload {
  terminal_code: string;
  terminal_name: string;
  pos_serial: string;
  pos_min: string;
  is_active?: boolean;
}

export interface UpdateTerminalPayload {
  terminal_code?: string;
  terminal_name?: string;
  pos_serial?: string;
  pos_min?: string;
  is_active?: boolean;
}

export async function fetchActiveTerminals(): Promise<POSTerminal[]> {
  const response = await httpClient.get<{ terminals: POSTerminal[] }>("/api/terminals");
  return response.data.terminals || [];
}

export async function fetchAllTerminals(): Promise<POSTerminal[]> {
  const response = await httpClient.get<{ terminals: POSTerminal[] }>("/api/terminals/all");
  return response.data.terminals || [];
}

export async function createTerminal(payload: CreateTerminalPayload): Promise<POSTerminal> {
  const response = await httpClient.post<{ message: string; terminal: POSTerminal }>("/api/terminals", payload);
  return response.data.terminal;
}

export async function updateTerminal(id: number, payload: UpdateTerminalPayload): Promise<POSTerminal> {
  const response = await httpClient.put<{ message: string; terminal: POSTerminal }>(`/api/terminals/${id}`, payload);
  return response.data.terminal;
}

export async function deleteTerminal(id: number): Promise<void> {
  await httpClient.delete(`/api/terminals/${id}`);
}
