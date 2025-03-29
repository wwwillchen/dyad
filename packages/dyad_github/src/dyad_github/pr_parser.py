import re


def extract_github_pr_url(text: str) -> list[str]:
    """
    Extract GitHub pull request URLs from a string.
    Supports both https and http, www and non-www formats.

    Matches formats like:
    - https://github.com/owner/repo/pull/123
    - http://github.com/owner/repo/pull/123
    - https://www.github.com/owner/repo/pull/123
    - github.com/owner/repo/pull/123

    Args:
        text: String that may contain GitHub PR URLs

    Returns:
        List of matched GitHub PR URLs
    """
    pattern = r"(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9-]+/[a-zA-Z0-9-._]+/pull/\d+"

    return re.findall(pattern, text)


# Example usage
if __name__ == "__main__":
    test_string = """
    Here are some PR URLs:
    https://github.com/facebook/react/pull/25557
    http://github.com/tensorflow/tensorflow/pull/123
    https://www.github.com/kubernetes/kubernetes/pull/456
    github.com/torvalds/linux/pull/789
    """

    urls = extract_github_pr_url(test_string)
    for url in urls:
        print(f"Found PR URL: {url}")
