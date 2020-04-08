const core = require("@actions/core");
const github = require("@actions/github");
const semverRcompare = require("semver/functions/rcompare");
const md2json = require("md-2-json");
const findVersions = require("find-versions");

const labelForNoVersion = "🙁 No upgrading version specified";

// Look for a version on the issue body
const searchForVersion = (upgradingVersionSection) => {
  const versions = findVersions(upgradingVersionSection, { loose: true });

  if (versions.length === 0) {
    return;
  }

  const [latestVersionFound] = versions.sort(semverRcompare);

  return latestVersionFound;
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
    issue_number: issue.number,
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

    core.debug(version ? `Found version: ${version}` : "No version found.");

    // Get all the labels in the issue
    const { data: labels } = await client.issues.listLabelsOnIssue({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
    });

    // Loop through them
    await Promise.all(
      labels.map(async ({ name }) => {
        // Check that the version has been already added, if so, throw
        if (version && name === version) {
          throw new Error("Version already added to issue.");
        }

        const isLabelAVersion = !!searchForVersion(name);
        const isLabelForNoVersion = name === labelForNoVersion;

        // If there's a label that's not the version found and IS a release version
        // or the `labelForNoVersion`, remove it
        if (isLabelAVersion || (version && isLabelForNoVersion)) {
          core.debug("Removing outdated version from issue");

          return await client.issues.removeLabel({
            owner: issue.owner,
            repo: issue.repo,
            issue_number: issue.number,
            name,
          });
        }
      })
    );

    const labelToAdd = version || labelForNoVersion;

    try {
      // Make sure that the label to be added exists
      await client.issues.getLabel({
        owner: issue.owner,
        repo: issue.repo,
        name: labelToAdd,
      });

      await client.issues.addLabels({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number,
        labels: [labelToAdd],
      });
    } catch (_error) {
      // Label does not exist, log it up and move on
      core.debug(`Label ${labelToAdd} does not exist`);

      return;
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();
