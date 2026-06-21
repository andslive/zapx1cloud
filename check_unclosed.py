import re
import sys

def analyze_braces(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    regex = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'\n])*\'|\"(?:\\.|[^\\\"\n])*\"|`(?:\\.|[^\\`])*`',
        re.DOTALL | re.MULTILINE
    )
    
    def replacer(match):
        return ' ' * len(match.group(0))

    clean_content = regex.sub(replacer, content)

    stack = []
    lines = clean_content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char == '{':
                stack.append(i + 1)
            elif char == '}':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra '}}' at line {i+1}")

    if stack:
        print(f"Unclosed '{{' at lines: {stack}")
    else:
        print("All braces matched (considering strings/comments).")

if __name__ == "__main__":
    analyze_braces(sys.argv[1])
