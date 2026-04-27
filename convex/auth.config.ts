const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

const authConfig = {
  providers: [
    {
      domain: clerkIssuerDomain as string,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
