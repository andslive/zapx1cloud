import sys

def find_error(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    braces = 0
    parens = 0
    in_string = False
    string_char = None
    
    for i, line in enumerate(lines):
        comment_start = line.find('//')
        if comment_start != -1 and not in_string:
            line_to_process = line[:comment_start]
        else:
            line_to_process = line

        for j, char in enumerate(line_to_process):
            if char in ['"', "'", "`"]:
                if not in_string:
                    in_string = True
                    string_char = char
                elif string_char == char:
                    if j > 0 and line_to_process[j-1] == '\\':
                        pass
                    else:
                        in_string = False
            
            if not in_string:
                if char == '{': braces += 1
                elif char == '}': braces -= 1
                elif char == '(': parens += 1
                elif char == ')': parens -= 1
        
        if i+1 > 1266 and i+1 < 3000:
            if braces < 3 or parens < 1:
                print(f"Balance lost at line {i+1}: braces={braces}, parens={parens}")
                print(f"Content: {line.strip()}")
                return

find_error('supabase/functions/uazapi-webhook/index.ts')
