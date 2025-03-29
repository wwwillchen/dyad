# Publishing

Follow these instructions for releasing a new version of the Dyad packages to PyPI (e.g. `pip install mesop`).

## Check main branch

Before, cutting a release, you'll want to check two things:

1. The `main` branch should be healthy (e.g. latest commit is green).
2. Check the [snyk dashboard](https://app.snyk.io/org/wwwillchen/project/2b50bd95-96a7-4d2b-b919-a458c02c9697) to review security issues:

    - It only runs weekly so you need to click "Retest now". If there's any High security issues, then you should address it before publishing a release.

## Bump versions

### Main packages

If you're updating any of the regular Dyad code (i.e. outside of the `packages/dyad_cli`), then you should run bump version like this:

```sh
uv run scripts/bump_version.py --version 0.1.1
```

### CLI package

If the code in `packages/dyad_cli` is updated and needs to be release (which should be rare), then you bump version for the CLI package specifically like this:

```sh
uv run scripts/bump_version.py --version 0.1.1 --cli=true
```

## Merge PR

Merge the pull request which bumps the version for the package(s) in the previous step.

## Publish GitHub release

After you've submitted the PR which bumps the version, [publish a GitHub release](https://github.com/mesop-dev/mesop/releases/new), this will kickoff the PyPI upload process.

1. Click "Choose a tag" and type in the version you just released. This will create a new Git tag.
1. Click "Generate release notes".
1. **If this is a an RC:** Click "Set as a pre-release", **otherwise** leave the "Set as the latest release" checked.
1. If this is a regular (non-RC) release, click "Create a discussion for this release".
1. Click "Publish release".

## Smoke testing

Install dyad:

```sh
pip install dyad
```

Run dyad:

```sh
dyad
```

Scenarios:

- Make sure calling LLM with local API key works.
- Make sure calling LLM with LLM proxy (Dyad Pro) works.

## Promoting RC to regular release

The goal is to have an RC out for at least a few days for dogfooding. If there's no issues, then promote it by creating a new GitHub release and using the same tag as the RC (assuming the RC didn't have any issues). If new issues are found, then kickoff a new RC.
