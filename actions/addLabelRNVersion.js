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

  return versions[0].replace(/\.0+$/m, "");
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

  core.debug(JSON.stringify({ updatedIssue }));

  if (updatedIssue.state === "closed") {
    // Do nothing if the issue has been closed
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

    core.debug(JSON.stringify({ version }));

    const { data: labels } = await client.issues.listLabelsOnIssue({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number
    });

    core.debug(JSON.stringify({ labels }));

    await Promise.all(
      labels.map(async ({ name }) => {
        if (name === version) {
          return;
        }

        if (searchForVersion(name)) {
          return await client.issues.removeLabel({
            owner: issue.owner,
            repo: issue.repo,
            issue_number: issue.number,
            name
          });
        }
      })
    );

    if (!version) {
      // No version found, do nothing
      return;
    }

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
      return;
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();
