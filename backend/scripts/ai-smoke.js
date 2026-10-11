import { analyzeRequest, getAIProviderStatus } from '../src/ai/analyzer.js'
import { validateAnalysisOutput } from '../src/ai/validate-analysis.js'

const provider = getAIProviderStatus()
if (provider.status !== 'enabled') {
  console.error(`AI provider is ${provider.status}; configure BANKISM_AI_PROVIDER, BANKISM_AI_MODEL, and BANKISM_AI_API_KEY in the ignored local .env file first.`)
  process.exitCode = 1
} else {
  const input = { request: 'What is my account balance?', memo: '', recipient: '' }
  const result = await analyzeRequest(input)
  const validation = result.status === 'complete' ? validateAnalysisOutput(result.output, input) : { valid: false, error: result.message }
  console.log(JSON.stringify({ provider: provider.provider, providerStatus: result.providerStatus ?? (validation.valid ? 'available' : 'unavailable'), responseSchemaValid: validation.valid, error: validation.valid ? undefined : validation.error }, null, 2))
  if (!validation.valid) process.exitCode = 1
}
