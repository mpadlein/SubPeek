# Project Audit

You are a senior engineer doing a thorough audit of this codebase. Scan the entire project and produce a structured TODO report covering:

## 1. 🐛 Bugs & Mistakes
- Logic errors, off-by-one, null/undefined risks
- Unhandled errors or missing error boundaries
- Race conditions or async pitfalls

## 2. 🔒 Security Issues
- Hardcoded secrets, API keys, passwords
- Injection risks (SQL, XSS, etc.)
- Insecure dependencies or configs

## 3. 🚀 Performance
- N+1 queries, unnecessary re-renders
- Missing memoization, caching, or indexes
- Heavy blocking operations

## 4. 🏗️ Missing Pieces
- Incomplete features (TODO/FIXME/HACK comments)
- Missing tests for critical paths
- Missing error handling or loading states
- Missing environment variable validation

## 5. 🧹 Code Quality
- Dead code, unused imports, duplicated logic
- Overly complex functions that should be split
- Inconsistent naming or patterns

## 6. 📄 Documentation Gaps
- Missing README sections
- Undocumented public APIs or functions
- Missing `.env.example` or setup instructions

For each issue found:
- Show the **file path + line number**
- Give a **1-line description** of the problem
- Suggest a **concrete fix**

Prioritize by: Critical > High > Medium > Low.
Start by listing files you'll scan, then proceed systematically.
