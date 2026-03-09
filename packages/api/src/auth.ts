import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Kysely, CamelCasePlugin } from "kysely";
import { D1Dialect } from "kysely-d1";
import { Resend } from "resend";

type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  AUTH_ORIGIN?: string;
  RESEND_FROM_EMAIL?: string;
};

export function createAuth(env: AuthEnv) {
  const db = new Kysely({
    dialect: new D1Dialect({ database: env.DB }),
    plugins: [new CamelCasePlugin()],
  });

  return betterAuth({
    database: { db, type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.AUTH_ORIGIN,
    user: { modelName: "users" },
    session: { modelName: "sessions" },
    emailAndPassword: { enabled: false },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const resend = new Resend(env.RESEND_API_KEY);
          await resend.emails.send({
            from: env.RESEND_FROM_EMAIL ?? "Lattice <noreply@lattice.app>",
            to: email,
            subject: "Sign in to Lattice",
            html: `<a href="${url}">Click here to sign in to Lattice</a>`,
          });
        },
      }),
    ],
  });
}
