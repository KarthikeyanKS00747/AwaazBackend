import express from "express";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

async function evaluateAnswer(slideContent, question, userAnswer) {
  const referencePrompt = `
  You are an expert evaluator. 
  Given the following question, generate a high-quality reference answer that has 3 sentences only based on the slide content.

  Slide Content: "${slideContent}
  Question: "${question}"
  Reference Answer:
  `;

  const refResult = await model.generateContent(referencePrompt);
  const referenceAnswer = refResult.response.text().trim();

  const evalPrompt = `
  You are an evaluator for presentation answers.
  Question: "${question}"
  User's Answer: "${userAnswer}"
  Reference Answer: "${referenceAnswer}"

  Tasks:
  1. Give a similarity score between the user's answer and the reference answer between 0 to 1.
  2. List out the missing sentences/points that could improve the user's answer.
  3. Return the output strictly in JSON with fields: similarity, missing.
  `;

  const evalResult = await model.generateContent(evalPrompt);
  const text = evalResult.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { similarity: null, missing: [text] };
  }

  return { parsed, referenceAnswer };
}

async function generateReport(qaPairs) {
  const results = [];
  for (const { question, userAnswer } of qaPairs) {
    const evaluation = await evaluateAnswer(question, userAnswer);

    results.push({
      Question: question,
      "User Answer": userAnswer,
      "Reference Answer": evaluation.referenceAnswer,
      "Similarity Score": evaluation.parsed.similarity,
      "Missing Points": evaluation.parsed.missing.join(" . "),
    });
  }
  return results;
}

app.post("/getAnalysis", async (req, res) => {
  try {
    const qaPairs = req.body.qaPairs;
    if (!qaPairs || !Array.isArray(qaPairs)) {
      return res.status(400).json({ error: "qaPairs must be an array" });
    }

    const report = await generateReport(qaPairs);
    res.json({ success: true, report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
