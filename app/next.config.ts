import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit usa i file metrici dei font standard (.afm): vanno inclusi nel bundle serverless
  // delle route che generano PDF, altrimenti su Vercel falliscono con ENOENT Helvetica.afm.
  outputFileTracingIncludes: {
    "/api/email/poll": ["./node_modules/pdfkit/js/data/**/*"],
    "/api/whatsapp/webhook": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
