module.exports = {
  hooks: {
    readPackage(packageManifest) {
      if (packageManifest.name === '@better-auth/infra') {
        packageManifest.peerDependencies = {
          ...packageManifest.peerDependencies,
        };
        delete packageManifest.peerDependencies.zod;
        packageManifest.dependencies = {
          ...packageManifest.dependencies,
          zod: '^4.1.12',
        };
      }

      return packageManifest;
    },
  },
};
