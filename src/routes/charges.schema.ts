import { z } from "zod";

const paymentMethodSchema = z.enum(["boleto", "pix"]);

export const chargeRequestSchema = z.object({
  provider_id: z.string().min(1).optional(),
  amount: z.number().int().min(1),
  due_date: z.string(),
  reference_id: z.string().optional(),
  payment_methods: z.array(paymentMethodSchema).min(1),
  customer: z.object({
    name: z.string().min(1),
    document: z.string().min(11).max(20),
    address: z
      .object({
        zip_code: z.string().optional(),
        street: z.string().optional(),
        number: z.string().optional(),
        complement: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional()
      })
      .partial()
      .optional()
  }),
  interest: z.record(z.any()).optional(),
  fine: z.record(z.any()).optional(),
  discounts: z.array(z.record(z.any())).optional(),
  provider_config: z.record(z.any()).optional()
});

export type ChargeRequest = z.infer<typeof chargeRequestSchema>;
