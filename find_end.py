import re
import sys

def find_block_end(file_path, start_line):
    with open(file_path, 'r') as f:
        content = f.read()

    regex = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'\n])*\'|\"(?:\\.|[^\\\"\n])*\"|`(?:\\.|[^\\`])*`',
        re.DOTALL | re.MULTILINE
    )
    
    def replacer(match):
        return ' ' * len(match.group(0))

    clean_content = regex.sub(replacer, content)
    lines = clean_content.split('\n')
    
    depth = 0
    target_depth = -1
    
    for i, line in enumerate(lines):
        line_num = i + 1
        opened = line.count('{')
        closed = line.count('}')
        
        if line_num == start_line:
            target_depth = depth
            depth += opened - closed
            print(f"DEBUG: Line {line_num}, opened={opened}, closed={closed}, depth={depth}, target={target_depth}")
            if depth == target_depth:
                 print(f"Block at {start_line} has no net braces.")
                 return
            continue
            
        if target_depth != -1:
            depth += opened - closed
            if depth <= target_depth:
                print(f"Block starting at {start_line} ends at line {line_num}")
                return
        else:
            depth += opened - closed

if __name__ == "__main__":
    find_block_end(sys.argv[1], int(sys.argv[2]))
