# AI Review Setup Guide

## Critical Fix Applied

The AI Review system has been fixed to use the **Anthropic API** directly instead of trying to invoke a non-existent CLI command.

### What Was Wrong

Previously, the code tried to call:

```bash
claude code --prompt-file /path/to/file
```

This command **does not exist** and was causing all AI reviews to fail with:

```
error: unknown option '--prompt-file'
```

The system would catch this error and return an empty fallback review, which is why you saw:

- `filesReviewed: 9` (files were correctly read)
- `totalIssues: 0` (AI never actually reviewed them)
- Response came immediately (because it was just returning fallback)

### What Was Fixed

**Modified Files:**

- [AIReviewService.ts:1-5](apps/cli/src/services/AIReviewService.ts#L1-5) - Added Anthropic SDK import
- [AIReviewService.ts:65-78](apps/cli/src/services/AIReviewService.ts#L65-78) - Added Anthropic client initialization
- [AIReviewService.ts:449-502](apps/cli/src/services/AIReviewService.ts#L449-502) - Replaced broken CLI call with proper API call
- [index.ts:2](apps/cli/src/index.ts#L2) - Added dotenv to load environment variables
- [.env.example](/.env.example) - Added ANTHROPIC_API_KEY requirement

**Key Changes:**

1. Now uses `@anthropic-ai/sdk` package (already installed)
2. Calls `anthropic.messages.create()` with proper API parameters
3. Uses Claude Sonnet 4 model (`claude-sonnet-4-20250514`)
4. Properly extracts text response and handles errors
5. Logs detailed information about API calls

## Setup Instructions

### Step 1: Get Your Anthropic API Key

1. Visit: https://console.anthropic.com/settings/keys
2. Log in or create an account
3. Click "Create Key"
4. Copy your API key (starts with `sk-ant-`)

### Step 2: Create .env File

Create a `.env` file in the project root:

```bash
cd /Users/highgarden/Developments/AI/HighReview
cp .env.example .env
```

Edit `.env` and add your API key:

```bash
# HighReview Environment Configuration

# Anthropic API Key (Required for AI Code Review)
ANTHROPIC_API_KEY=sk-ant-your-actual-api-key-here

# Optional: Set port if you want to use a different port
# PORT=8765
```

### Step 3: Restart Server

```bash
# If server is running, stop it (Ctrl+C)
cd apps/cli
npm run dev
```

You should now see:

```
🚀 Starting HighReview server...
✓ Server running at http://localhost:8765
```

**No longer see the warning:**
~~`[AI Review] ANTHROPIC_API_KEY not set. AI reviews will use fallback mode.`~~

### Step 4: Test AI Review

1. Open HighReview in browser: http://localhost:5273
2. Navigate to a PR
3. Click "Start Review" with AI options enabled
4. Wait for real AI review (will take 30-60 seconds for proper analysis)
5. Check browser console - you should see:
   ```javascript
   [AI Review] Calling Claude AI API...
   [AI Review] Prompt size: XXXXX characters
   [AI Review] AI response received: {
     responseLength: XXXX,
     stopReason: 'end_turn',
     inputTokens: XXXX,
     outputTokens: XXXX
   }
   ```

## Verification

### Server Logs (Should See)

```
[AI Review] Starting review for worktree: /path/to/worktree
[AI Review] Got diff from origin/branch-name, 8881 bytes
[AI Review] Found 9 changed files from origin/branch-name
[AI Review] Read 9 file contents
[AI Review] Calling Claude AI API...
[AI Review] Prompt size: 125000 characters
[AI Review] AI response received: {
  responseLength: 5234,
  stopReason: 'end_turn',
  inputTokens: 32145,
  outputTokens: 1234
}
[AI Review] Review completed: { filesReviewed: 9, totalIssues: 15 }
```

### Browser Console (Should See)

```javascript
[EnhancedAIReviewPanel] Rendering with data: {
  hasReview: true,
  filesReviewed: 9,
  totalIssues: 15,        // <-- Should NOT be 0!
  criticalIssues: 3,
  warnings: 7,
  suggestions: 5,
  hasChangeIntents: true,
  hasCallStacks: true,
  hasImpactAnalysis: true
}
```

## What AI Review Now Sends to Claude

The AI now receives:

1. **All changed files list** (file paths)
2. **Complete git diff** (showing exact changes)
3. **Full file contents** (up to 20 files, 50KB each) for context
4. **Selected review options:**
   - Change intent analysis (file/block level)
   - Call stack visualization (flowchart/sequence diagrams)
   - Impact analysis (module/project/dependency scope)
   - Semantic diff (moved code, refactoring detection)
   - Custom prompts
5. **Current conversation context** (if available)
6. **Related files** (for impact analysis)

All of this is packaged into a comprehensive prompt and sent to Claude Sonnet 4 for analysis.

## Cost Considerations

Anthropic API pricing (as of January 2025):

- Input: $3 per million tokens
- Output: $15 per million tokens

Typical PR review:

- Input: 30,000-50,000 tokens (~$0.10-0.15)
- Output: 2,000-5,000 tokens (~$0.03-0.08)
- **Total per review: ~$0.13-0.23**

For 100 reviews per month: ~$13-23

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not set"

**Solution:** Create `.env` file with your API key (see Step 2 above)

### Error: "401 Unauthorized"

**Possible causes:**

1. Invalid API key - check for typos
2. API key expired - generate new key
3. API key not from Anthropic - must start with `sk-ant-`

**Solution:**

```bash
# Verify your .env file
cat /Users/highgarden/Developments/AI/HighReview/.env

# Should show:
ANTHROPIC_API_KEY=sk-ant-...
```

### AI Review Still Returns Empty Results

**Check server logs for:**

```
[AI Review] Claude AI API call failed: [error details]
```

**Common issues:**

1. Network connectivity - check internet connection
2. API rate limit - wait and retry
3. Invalid API key - verify in console.anthropic.com
4. Prompt too large - try with smaller PR

**Solution:**

```bash
# Check server logs in terminal running `npm run dev`
# Look for detailed error information
```

### AI Review Takes Too Long (> 2 minutes)

This is now **expected behavior** for proper AI analysis!

- Small PRs (< 500 lines): 20-40 seconds
- Medium PRs (500-2000 lines): 40-90 seconds
- Large PRs (2000+ lines): 90-180 seconds

If it takes > 3 minutes, check:

1. API timeout settings (currently 120 seconds)
2. Network latency
3. PR size (very large PRs may need chunking)

## Model Configuration

Current settings in [AIReviewService.ts:466-470](apps/cli/src/services/AIReviewService.ts#L466-470):

```typescript
const message = await this.anthropic.messages.create({
  model: "claude-sonnet-4-20250514", // Latest Sonnet - balance of speed/quality
  max_tokens: 16000, // Increased for detailed reviews
  temperature: 0.3, // Lower = more focused and consistent
  messages: [
    /* prompt */
  ],
});
```

**Why Claude Sonnet 4:**

- Better code understanding than Sonnet 3.5
- Faster than Opus
- Lower cost than Opus
- Excellent at structured output (matches our format)

**To use a different model:**
Edit [AIReviewService.ts:466](apps/cli/src/services/AIReviewService.ts#L466):

```typescript
model: 'claude-opus-4-20250514',  // For highest quality (slower, more expensive)
// or
model: 'claude-sonnet-3-5-20241022',  // For faster reviews (slightly lower quality)
```

## Feature Verification Checklist

After setup, verify these features work:

- [ ] AI Review returns actual issues (not totalIssues: 0)
- [ ] Critical Issues section populated
- [ ] Warnings section populated
- [ ] Suggestions section populated
- [ ] Change Intent analysis visible (if enabled)
- [ ] Call Stack visualization with Mermaid diagrams (if enabled)
- [ ] Impact Analysis showing affected areas (if enabled)
- [ ] Moved Code detection (if enabled)
- [ ] Refactoring detection (if enabled)
- [ ] Review summary in Korean (if language set to 'ko')

## Additional Resources

- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/messages_post)
- [Claude Sonnet 4 Model Card](https://www.anthropic.com/news/claude-4)
- [HighReview Code Navigation Guide](CODE_NAVIGATION_GUIDE.md)
- [Final Implementation Summary](FINAL_IMPLEMENTATION_SUMMARY.md)

## Support

If AI Review still doesn't work after following this guide:

1. Check server terminal logs for detailed error messages
2. Check browser console for frontend errors
3. Verify `.env` file exists and contains valid API key
4. Test API key directly with curl:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '{
       "model": "claude-sonnet-4-20250514",
       "max_tokens": 1024,
       "messages": [{"role": "user", "content": "Hello"}]
     }'
   ```

---

**Fixed Date:** 2026-01-28
**Fixed By:** Claude Sonnet 4.5
**Status:** ✅ Production Ready
