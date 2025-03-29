import base64
import os
import re
from dataclasses import dataclass

import requests


@dataclass
class PullRequestFile:
    filename: str
    status: str  # 'added', 'removed', 'modified'
    content: str
    patch: str | None


class GitHubPRFetcher:
    def __init__(self, github_token: str | None = None):
        """Initialize the fetcher with optional GitHub token for authentication."""
        self.github_token = github_token
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
        }
        if github_token:
            self.headers["Authorization"] = f"token {github_token}"

    def _parse_pr_url(self, pr_url: str) -> tuple[str, str, int]:
        """Extract owner, repo, and PR number from GitHub PR URL."""
        pattern = r"github\.com/([^/]+)/([^/]+)/pull/(\d+)"
        match = re.search(pattern, pr_url)
        if not match:
            raise ValueError("Invalid GitHub PR URL format")
        return match.group(1), match.group(2), int(match.group(3))

    def _get_pr_details(self, owner: str, repo: str, pr_number: int) -> dict:
        """Fetch basic PR information."""
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def _get_pr_files(
        self, owner: str, repo: str, pr_number: int
    ) -> list[PullRequestFile]:
        """Fetch files changed in the PR."""
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}/files"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()

        files = []
        for file_data in response.json():
            # Fetch file content if file was not deleted
            content = ""
            if file_data["status"] != "removed":
                content_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_data['filename']}"
                content_response = requests.get(
                    content_url,
                    headers=self.headers,
                    params={"ref": file_data.get("sha")},
                )
                if content_response.status_code == 200:
                    content_data = content_response.json()
                    if content_data.get("encoding") == "base64":
                        content = base64.b64decode(
                            content_data["content"]
                        ).decode("utf-8")

            files.append(
                PullRequestFile(
                    filename=file_data["filename"],
                    status=file_data["status"],
                    content=content,
                    patch=file_data.get("patch"),
                )
            )

        return files

    def get_pr_contents(self, pr_url: str) -> str:
        # Parse PR URL
        owner, repo, pr_number = self._parse_pr_url(pr_url)

        # Get PR details
        pr_details = self._get_pr_details(owner, repo, pr_number)

        # Get PR files
        pr_files = self._get_pr_files(owner, repo, pr_number)

        # Format output
        output = []
        output.append(f"Pull Request: {pr_details['title']}")
        output.append(f"Author: {pr_details['user']['login']}")
        output.append(
            f"Description:\n{pr_details['body'] or 'No description provided.'}"
        )
        output.append("\nFiles changed:")

        for file in pr_files:
            output.append(f"\n--- {file.filename} ({file.status}) ---")
            if file.status == "removed":
                output.append("File was removed")
            else:
                output.append("Content:")
                output.append(file.content)
            if file.patch:
                output.append("\nDiff:")
                output.append(file.patch)

        return "\n".join(output)


def fetch_pr_contents(pr_url: str, github_token: str | None = None) -> str:
    if github_token is None:
        github_token = os.environ["GITHUB_PERSONAL_ACCESS_TOKEN"]
    fetcher = GitHubPRFetcher(github_token)
    return fetcher.get_pr_contents(pr_url)
