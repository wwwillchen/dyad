from pathlib import Path

import requests

# Icon mapping with language names as keys
icon_map = {
    # Programming Languages
    "typescript": "typescript/typescript-original.svg",
    "javascript": "javascript/javascript-original.svg",
    "python": "python/python-original.svg",
    "java": "java/java-original.svg",
    "cplusplus": "cplusplus/cplusplus-original.svg",
    "c": "c/c-original.svg",
    "csharp": "csharp/csharp-original.svg",
    "go": "go/go-original.svg",
    "ruby": "ruby/ruby-original.svg",
    "php": "php/php-original.svg",
    "swift": "swift/swift-original.svg",
    "kotlin": "kotlin/kotlin-original.svg",
    "rust": "rust/rust-plain.svg",
    # Web Technologies
    "html": "html5/html5-original.svg",
    "css": "css3/css3-original.svg",
    "sass": "sass/sass-original.svg",
    "react": "react/react-original.svg",
    "vue": "vuejs/vuejs-original.svg",
    # Data & Config
    "markdown": "markdown/markdown-original.svg",
    "nodejs": "nodejs/nodejs-original.svg",
    "mysql": "mysql/mysql-original.svg",
}

BASE_URL = "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/"
OUTPUT_DIR = Path("src/dyad_app/static/devicons")


def download_icons():
    # Create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Download each icon
    for language, path in icon_map.items():
        url = BASE_URL + path
        output_path = OUTPUT_DIR / f"{language}.svg"

        try:
            print(f"Downloading {language}.svg...")
            response = requests.get(url)
            response.raise_for_status()  # Raise an exception for bad status codes

            # Save the SVG file
            with open(output_path, "wb") as f:
                f.write(response.content)
            print(f"Successfully downloaded {language}.svg")

        except requests.exceptions.RequestException as e:
            print(f"Error downloading {language}.svg: {e}")


if __name__ == "__main__":
    download_icons()
