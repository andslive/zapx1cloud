import re
import sys

def debug_lines(file_path, start, end):
    with open(file_path, 'r') as f:
        content = f.read()

    regex = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'\n])*\'|\"(?:\\.|[^\\\"\n])*\"|`(?:\\.|[^\\`])*`',
        re.DOTALL | re.MULTILINE
    )
    
    def replacer(match):
        return re.sub(r'[^\n]', ' ', match.group(0))

    clean_content = regex.sub(replacer, content)
    lines = clean_content.split('\n')
    
    for i in range(max(0, start-1), min(len(lines), end)):
        print(f"{i+1:4}: |{lines[i]}|")

if __name__ == "__main__":
    debug_lines(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
