import re

def remove_strings_and_comments(code):
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    code = re.sub(r'"(?:\\.|[^"\\])*"', '', code)
    code = re.sub(r"'(?:\\.|[^'\\])*'", '', code)
    code = re.sub(r"`(?:\\.|[^`\\])*`", '', code)
    return code

with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    lines = f.readlines()

stack = []
fixed_lines = []
for i, line in enumerate(lines, 1):
    clean_line = remove_strings_and_comments(line)
    for char in clean_line:
        if char == '{':
            stack.append(i)
        elif char == '}':
            if stack:
                stack.pop()
            else:
                # Found extra closing brace, skip this line if it's just a brace
                if line.strip() == '}':
                    print(f"Skipping extra closing brace at line {i}")
                    continue
    fixed_lines.append(line)

# Now check if we have unclosed braces at the end
if stack:
    print(f"Adding {len(stack)} closing braces at the end")
    for _ in range(len(stack)):
        fixed_lines.append("}\n")

with open('supabase/functions/uazapi-webhook/index.ts', 'w') as f:
    f.writelines(fixed_lines)
