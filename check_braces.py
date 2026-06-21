import re

def strip_content(text):
    # Remove comments
    text = re.sub(r'//.*', '', text)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    # Remove strings (handle escapes)
    text = re.sub(r'"(\\.|[^"\\])*"', '""', text)
    text = re.sub(r"'(\\.|[^'\\])*'", "''", text)
    text = re.sub(r"`(\\.|[^`\\])*`", "``", text, flags=re.DOTALL)
    # Remove regex literals (basic)
    text = re.sub(r'/(?!/| \*)(?:\\.|[^/\\])+/', '//', text)
    return text

with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    stripped = strip_content(line)
    for char in stripped:
        if char == '{':
            stack.append(('{', i+1))
        elif char == '}':
            if not stack:
                print(f"Extra }} at line {i+1}")
            else:
                stack.pop()
        elif char == '(':
            stack.append(('(', i+1))
        elif char == ')':
            if not stack:
                print(f"Extra ) at line {i+1}")
            elif stack[-1][0] == '(':
                stack.pop()
            else:
                print(f"Mismatched ) at line {i+1}, expected {stack[-1][0]} from line {stack[-1][1]}")
                stack.pop()

for char, line in stack:
    print(f"Unclosed {char} from line {line}")

