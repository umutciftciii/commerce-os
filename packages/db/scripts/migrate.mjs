import { spawn } from "node:child_process";

const child = spawn(
  "DEBUG='prisma:migrate:*' pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma",
  {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
