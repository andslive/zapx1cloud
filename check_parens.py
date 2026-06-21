import re
import sys

def check_parens(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    regex = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'\n])*\'|\"(?:\\.|[^\\\"\n])*\"|`(?:\\.|[^\\`])*`',
        re.DOTALL | re.MULTILINE
    )
    
    def replacer(match):
        return re.sub(r'[^\n]', ' ', match.group(0))

    clean_content = regex.sub(replacer, content)

    stack = []
    lines = clean_content.split('\n')
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '(':
                stack.append(line_num)
            elif char == ')':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra ')' at line {line_num}")
    
    if stack:
        print(f"Unclosed '(' at lines: {stack}")
    else:
        print("All parentheses matched.")

if __name__ == "__main__":
    check_parens(sys.argv[1])
