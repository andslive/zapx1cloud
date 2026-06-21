import sys

def check_balance(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    braces = 0
    parens = 0
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            elif char == '(': parens += 1
            elif char == ')': parens -= 1
        
        if braces < 0 or parens < 0:
            print(f"Negative balance at line {i+1}: braces={braces}, parens={parens}")
            # return
    
    print(f"Final balance: braces={braces}, parens={parens}")

check_balance('supabase/functions/uazapi-webhook/index.ts')
