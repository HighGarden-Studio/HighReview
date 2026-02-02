
import { LMStudioProvider } from './src/services/providers/LMStudioProvider.js';

async function run() {
  const provider = new LMStudioProvider();
  
  console.log('Checking availability...');
  const isAvailable = await provider.isAvailable();
  console.log('Available:', isAvailable);

  if (!isAvailable) {
    console.error('LM Studio is not running!');
    return;
  }

  console.log('Testing small prompt...');
  try {
    const res = await provider.review({
      prompt: 'Hello, are you working?',
      timeout: 10000
    });
    console.log('Small prompt success:', res.content.slice(0, 50) + '...');
  } catch (e: any) {
    console.error('Small prompt failed:', e.message);
  }

  console.log('\nTesting LARGE prompt (potential 400 error)...');
  try {
    // Generate a massive string to exceed context window of typical small models (e.g. > 8k tokens)
    const largePrompt = 'repeat this word '.repeat(10000); 
    const res = await provider.review({
      prompt: largePrompt,
      timeout: 30000
    });
    console.log('Large prompt success?! Content length:', res.content.length);
  } catch (e: any) {
    console.error('Large prompt failed as expected:', e.message);
  }
}

run();
