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

    depth = 0
    lines = clean_content.split('\n')
    for i, line in enumerate(lines):
        opened = line.count('{')
        closed = line.count('}')
        depth += opened - closed
        if depth != 0 and i < 1129:
             if (i+1) % 100 == 0 or i < 100:
                print(f'Line {i+1}: depth={depth} | {lines[i].strip()}')
    
    print(f'Depth at 1129: {depth}')

if __name__ == "__main__":
    analyze_braces(sys.argv[1])
