# fmt: off
SUPPORTED_TEXT_EXTENSIONS = {
    # Programming Languages
    '.py', '.pyi', '.pyx', '.pxd',  # Python
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',  # JavaScript/TypeScript
    '.java', '.kt', '.kts', '.groovy', '.scala',  # JVM
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',  # C/C++
    '.cs', '.fs', '.fsx', '.vb',  # .NET
    '.go', '.rs', '.rb', '.php', '.pl', '.pm',  # Other languages
    '.swift', '.m', '.mm',  # Apple
    '.r', '.R', '.jl',  # Data Science
    '.sql', '.psql', '.plsql',  # SQL
    '.lua', '.tcl', '.perl', '.erl', '.ex', '.exs',  # Scripting
    
    # Web Development
    '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte', '.astro', '.liquid',
    '.xml', '.xsl', '.xslt', '.wsdl', '.graphql', '.gql',
    
    # Shell Scripts
    '.sh', '.bash', '.zsh', '.fish', '.command', '.bat', '.cmd', '.ps1',
    
    # Configuration Files
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.properties', '.env', '.editorconfig', '.gitignore', '.dockerignore',
    '.lock', '.gradle', '.pom', '.sbt',
    
    # Documentation
    '.md', '.mdx', '.markdown', '.rst', '.asciidoc', '.adoc', '.txt',
    '.textile', '.creole', '.wiki', '.dokuwiki', '.mediawiki',
    '.tex', '.ltx', '.bib',
    
    # Build and Package Files
    '.cmake', '.make', '.mak', '.ninja',
    '.gemspec', '.rake', '.podspec',
    '.cabal', '.hs', '.lhs',  # Haskell
    
    # Data Formats
    '.csv', '.tsv', '.svg', '.proto', '.avsc',  # Avro schema
    
    # Template Files
    '.j2', '.jinja', '.jinja2', '.tmpl', '.tpl', '.template',
    
    # Other Development Files
    '.vim', '.nvim',  # Vim configuration
    '.el',  # Emacs Lisp
    '.clj', '.cljs', '.cljc',  # Clojure
    '.dart', '.elm', '.hrl',  # Various languages
}
