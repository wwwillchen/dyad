def remove_code_fence(code: str) -> str:
    lines = code.split("\n")
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def remove_dyad_annotations(code: str) -> str:
    return (
        "\n".join(
            [
                line
                for line in code.splitlines()
                if not line.strip().startswith("# @dyad:")
                and not line.strip().startswith("// @dyad:")
                and "(keep code the same)" not in line
            ]
        )
        + "\n"
    )  # adding trailing new line
