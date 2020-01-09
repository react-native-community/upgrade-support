const fs = require("fs");
const core = require("@actions/core");
const github = require("@actions/github");
const semver = require("semver/preload");

(async () => {
  const client = new github.GitHub(
    core.getInput("github-token", { required: true })
  );

  const {
    data: { content }
  } = await client.repos.getContents({
    owner: "react-native-community",
    repo: "rn-diff-purge",
    path: "RELEASES"
  });

  const lastSyncedRelease = fs.readFileSync(".lastsynced", "utf-8");

  core.debug(`Last synced released: ${lastSyncedRelease}`);

  const releases = Buffer.from(content, "base64")
    .toString("ascii")
    .split("\n");

  const releasesAfterLastSynced = releases.filter(
    release => semver.valid(release) && semver.gt(release, lastSyncedRelease)
  );

  core.debug(`Last released after last sync: ${releasesAfterLastSynced[0]}`);

  if (releasesAfterLastSynced.length === 0) {
    core.debug(`No releases found after ${lastSyncedRelease}`);

    return;
  }

  try {
    await Promise.all(
      releasesAfterLastSynced.map(release =>
        client.issues.createLabel({
          owner: "react-native-community",
          repo: "upgrade-support",
          name: release,
          color: "cfd3d7"
        })
      )
    );

    // The last release is the first entry as the list is sorted backwards
    const [lastRelease] = releasesAfterLastSynced;

    await client.repos.updateFile({
      owner: "react-native-community",
      repo: "upgrade-support",
      content: lastRelease,
      message: "Update release versions",
      path: ".lastsynced"
    });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
