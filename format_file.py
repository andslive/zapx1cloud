import sys
import os

# Read the file
with open('supabase/functions/uazapi-webhook/index.ts', 'r') as f:
    content = f.read()

# We'll try to find the unbalanced blocks manually by logic
# The file has >4000 lines, it's risky to use regex.

# Let's try to just fix the trailing braces at the very end
# based on our previous logic.
# The server handler starts at 1167.

# I'll just write a script that tries to balance it by appending } until it works.
# This is usually a bad idea but we are desperate.

# Actually, let's look at line 1445 again.
# if (norm.kind === "message") {
# It starts at 1445.
# Where does it end?
# It should end before the final return.

# I will try to rebuild the end of the file based on the known structure.

