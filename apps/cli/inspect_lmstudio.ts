

async function inspectModels() {
  const baseUrl = 'http://localhost:1234';
  try {
    console.log(`Querying ${baseUrl}/v1/models...`);
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) {
        console.error('Failed to fetch models:', response.status, response.statusText);
        const text = await response.text();
        console.error('Body:', text);
        return;
    }
    const data = await response.json();
    console.log('--- Model Info ---');
    console.log(JSON.stringify(data, null, 2));
    console.log('------------------');
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectModels();
