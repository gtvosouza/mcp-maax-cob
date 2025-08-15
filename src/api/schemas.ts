import { z } from "zod";

export const InitializeProviderRequest = z.object({
  provider_type: z.enum(["sicredi", "banco_do_brasil", "cora", "itau", "mock"]),
  friendly_name: z.string().min(1),
  credentials: z.record(z.any()),
  provider_specific_config: z.record(z.any()),
});

export const ChargeRequest = z.object({
  provider_id: z.string().uuid(),
  amount: z.number().int().min(1),
  due_date: z.string(), // ISO date
  reference_id: z.string().optional(),
  payment_methods: z.array(z.enum(["boleto", "pix"])),
  customer: z.object({
    name: z.string().min(1),
    document: z.string().min(11).max(20),
    address: z.record(z.any()).optional(),
  }),
  interest: z.record(z.any()).optional(),
  fine: z.record(z.any()).optional(),
  discounts: z.array(z.record(z.any())).optional(),
});

export type ChargeRequestT = z.infer<typeof ChargeRequest>;
export type InitializeProviderRequestT = z.infer<typeof InitializeProviderRequest>;
