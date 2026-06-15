import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

/** Client Anthropic singleton — solo lato server. */
export function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata')
    _client = new Anthropic({ apiKey })
  }
  return _client
}
