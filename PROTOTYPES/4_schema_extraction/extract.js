require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');

// Ensure you have GEMINI_API_KEY set in your environment
const ai = new GoogleGenAI({});

async function extractSchema(markdownContent) {
  // Define the strict JSON schema we want the LLM to output
  // Maxun / Crawl4AI Philosophy: Guarantee structured output
  const productSchema = {
    type: Type.OBJECT,
    properties: {
      products: {
        type: Type.ARRAY,
        description: "A list of products mentioned in the article or page",
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "The name of the product"
            },
            price: {
              type: Type.NUMBER,
              description: "The price of the product if mentioned, otherwise null",
              nullable: true
            },
            features: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of key features or specs mentioned"
            }
          },
          required: ["name"]
        }
      },
      summary: {
        type: Type.STRING,
        description: "A 2-sentence summary of the overall page content"
      }
    },
    required: ["products", "summary"]
  };

  console.log("Analyzing markdown and extracting structured data...");
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract the product information from the following markdown text:\n\n${markdownContent}`,
      config: {
        // This is the magic: forcing the model to strictly adhere to the schema
        responseMimeType: "application/json",
        responseSchema: productSchema,
      }
    });

    // The output is guaranteed to be a JSON string matching the schema
    const structuredData = JSON.parse(response.text);
    console.log("\n--- Extraction Success! ---");
    console.log(JSON.stringify(structuredData, null, 2));
    
    return structuredData;
  } catch (err) {
    console.error("Extraction failed:", err);
  }
}

// Mock markdown content for demonstration
const sampleMarkdown = `
# Best Laptops of 2026

If you're looking for a new laptop, here are the top picks.

## 1. Apple MacBook Pro 16 (M5 Max)
The new MacBook Pro is a beast. It costs $3499. Key features include a 16-inch Liquid Retina XDR display, up to 128GB of unified memory, and insane battery life.

## 2. Dell XPS 15
A great Windows alternative. It has an OLED screen, an Intel Core Ultra processor, and a sleek carbon fiber chassis. No official price yet, but expected around $1999.
`;

extractSchema(sampleMarkdown);
