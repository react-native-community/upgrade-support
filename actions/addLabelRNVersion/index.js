const core = require("@actions/core");
const github = require("@actions/github");
const md2json = require("md-2-json");
const findVersions = require("find-versions");

// Look for a version on the issue body
const searchForVersion = upgradingVersionSection => {
  const versions = findVersions(upgradingVersionSection, { loose: true });

  if (versions.length === 0) {
    return;
  }

  return versions[0];
};

(async () => {
  const { issue } = github.context;

  const client = new github.GitHub(
    core.getInput("github-token", { required: true })
  );

  // This fetches the issue again as it can have different data after running the other actions
  const { data: updatedIssue } = await client.issues.get({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number
  });

  if (updatedIssue.state === "closed") {
    // Do nothing if the issue has been closed
    core.debug("Issue already closed");

    return;
  }

  const parsedIssueBodyMarkdown = md2json.parse(
    github.context.payload.issue.body
  );

  try {
    const { raw: upgradingVersionSection } = parsedIssueBodyMarkdown[
      "Environment"
    ]["Upgrading version"];

    const version = searchForVersion(upgradingVersionSection);

    if (!version) {
      core.debug("No version found.");

      return;
    }

    core.debug(`Found version: ${version}`);

    const { data: labels } = await client.issues.listLabelsOnIssue({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number
    });

    await Promise.all(
      labels.map(async ({ name }) => {
        if (name === version) {
          throw new Error("Version already added to issue.");
        }

        if (searchForVersion(name)) {
          core.debug("Removing outdated version from issue");

          return await client.issues.removeLabel({
            owner: issue.owner,
            repo: issue.repo,
            issue_number: issue.number,
            name
          });
        }
      })
    );

    try {
      await client.issues.getLabel({
        owner: issue.owner,
        repo: issue.repo,
        name: version
      });

      await client.issues.addLabels({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        labels: [version]
      });
    } catch (_error) {
      // Label does not exist, do nothing
      core.debug("Label with version does not exist");

      return;
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();
