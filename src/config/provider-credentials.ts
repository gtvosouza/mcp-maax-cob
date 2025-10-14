import { z } from "zod";

export const providerIdSchema = z.enum(["cora", "sicredi", "itau", "banco_do_brasil"]);
export type ProviderId = z.infer<typeof providerIdSchema>;

const coraCredentialsSchema = z
  .object({
    client_id: z.string().min(1),
    account_id: z.string().min(1),
    client_secret: z.string().min(1).optional(),
    cert: z.string().min(1).optional(),
    private_key: z.string().min(1).optional(),
    sandbox: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    const usesSecret = Boolean(value.client_secret);
    const usesCert = Boolean(value.cert || value.private_key);

    if (!usesSecret && !usesCert) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either client_secret or cert/private_key for Cora",
        path: ["client_secret"]
      });
    }

    if (value.cert && !value.private_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "private_key is required when cert is provided",
        path: ["private_key"]
      });
    }

    if (value.private_key && !value.cert) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cert is required when private_key is provided",
        path: ["cert"]
      });
    }
  });

const sicrediCredentialsSchema = z.object({
  cooperativa: z.string().min(1),
  posto: z.string().min(1),
  codigo_beneficiario: z.string().min(1),
  api_key: z.string().min(1),
  sandbox: z.boolean().optional()
});

const itauCredentialsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  certificate_path: z.string().min(1).optional(),
  certificate_password: z.string().min(1).optional(),
  key_id: z.string().min(1).optional(),
  sandbox: z.boolean().optional()
});

const bancoDoBrasilCredentialsSchema = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    developer_application_key: z.string().min(1),
    account_number: z.string().min(1),
    account_type: z.string().min(1),
    scopes: z.array(z.string().min(1)).optional(),
    cert: z.string().min(1).optional(),
    cert_key: z.string().min(1).optional(),
    sandbox: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.sandbox === false) {
      if (!value.cert) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cert is required when sandbox is false",
          path: ["cert"]
        });
      }
      if (!value.cert_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cert_key is required when sandbox is false",
          path: ["cert_key"]
        });
      }
    }
  });

export const providerCredentialSchemas: Record<ProviderId, z.ZodTypeAny> = {
  cora: coraCredentialsSchema,
  sicredi: sicrediCredentialsSchema,
  itau: itauCredentialsSchema,
  banco_do_brasil: bancoDoBrasilCredentialsSchema
};

export function validateProviderCredentials<T extends ProviderId>(providerId: T, credentials: unknown) {
  const schema = providerCredentialSchemas[providerId];
  return schema.parse(credentials) as z.infer<(typeof providerCredentialSchemas)[T]>;
}
