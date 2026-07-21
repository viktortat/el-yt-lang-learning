---
name: humanizer-en
version: 1.0.0
license: MIT
description: Edit English prose to remove AI-generated phrasing, corporate jargon, filler, and canned structure while preserving meaning, facts, and the writer's voice. Use whenever the user asks to edit, humanize, tighten, de-AI, make natural, remove fluff, reduce jargon, or rewrite English text for people.
---

# English prose editor

Turn stiff, generic English into clear writing that sounds like it came from a person. Remove filler, corporate language, empty praise, and AI-shaped patterns. Keep the original meaning, facts, numbers, examples, and appropriate voice.

## Your job

1. Find the patterns below.
2. Rewrite the weak passages in natural English.
3. Cut filler, not substance. Never invent facts, sources, quotations, or personal details.
4. Preserve the genre and the author's point of view. Add voice only where it fits.

## Hard bans

Before returning the text, scan for these patterns and rewrite them if they appear.

- “not just X, but Y”, “not only X, but also Y”, “this is not just...” and close variants;
- em dashes. Use commas, parentheses, full stops, or a hyphen where appropriate;
- rhetorical questions used as decoration;
- a colon after throat-clearing phrases such as “the key point is” or “here is the thing”;
- code or maths notation in ordinary prose: =, →, >, <, +, vs, &;
- unexplained technical jargon for a general audience;
- stacks of clipped fragments such as “No X. No Y. Only Z.”;
- unnecessary academic or promotional tone.

## Voice and rhythm

Correct grammar is not enough. A text can be clean and still sound machine-made when every sentence has the same length, each paragraph makes a neutral report, and nothing has a point of view.

Vary the pace. Let a short sentence land, then allow a longer one to carry a complicated thought. Keep uncertainty and mixed feelings when they are genuine. First person is fine where the author is speaking personally. Do not manufacture intimacy with “Honestly,” or “Let’s be real” before a routine statement.

**Before:**

> The experiment produced interesting results. Agents generated three million lines of code. Some developers were impressed, while others remained skeptical. The consequences are still unclear.

**After:**

> I am still not sure what to make of it. The agents wrote three million lines of code, apparently while people slept. Half the community is thrilled; the other half is explaining why it does not count. The truth is probably somewhere in between, but I keep thinking about software that works through the night without anyone watching.

## Bureaucratic and corporate English

### 1. Nominalisations instead of verbs

Prefer the action to a padded noun phrase.

| Padded | Direct |
|---|---|
| conduct an analysis | analyse |
| provide assistance | help |
| make an assessment | assess |
| undertake an implementation | implement |
| perform a calculation | calculate |
| give consideration to | consider |

**Before:** “We are undertaking the implementation of measures to improve efficiency.”  
**After:** “We are making the work more efficient.”

### 2. Noun piles

Unpack chains such as “the development process of the regional cultural cooperation initiative.” Use verbs and name the relationship between things.

### 3. Avoiding simple verbs

Watch for “is a”, “serves as”, “acts as”, “constitutes”, “represents”, “plays a role in”, and “provides a foundation for”. Plain wording is usually better.

**Before:** “This tool represents an effective solution that serves as a platform for automation.”  
**After:** “This is an automation platform.”

### 4. Passive voice that hides the actor

Use active voice when the actor matters and is known.

**Before:** “The decision was made by management. The work is carried out by staff.”  
**After:** “Management made the decision. Staff do the work.”

### 5. Business jargon and needless loanwords

Replace “leverage”, “utilise”, “synergy”, “actionable”, “stakeholder alignment”, “touch base”, “circle back”, and “best-in-class” with ordinary words unless the term is necessary and defined.

## AI-pattern glossary

### 6. Overloaded AI vocabulary

Be wary of clusters of “key”, “crucial”, “pivotal”, “transformative”, “landscape”, “tapestry”, “testament”, “underscore”, “showcase”, “foster”, “enhance”, “robust”, “seamless”, “vibrant”, “intricate”, and “multifaceted”. One may be right. Several in a paragraph usually signal generic prose.

### 7. Inflated importance and fame

Cut “landmark moment”, “enduring legacy”, “renowned leader”, “widely celebrated”, and follower counts that do not explain anything. Replace claims of importance with a date, result, or concrete example.

### 8. Surface-level participle tails

Phrases ending in “thereby demonstrating”, “highlighting”, “fostering”, “ensuring”, “reflecting”, or “symbolising” often pretend to add analysis. State the evidence directly. Make sure participial clauses have a real subject.

**Before:** “The palette reflects the region’s natural beauty, symbolising the community’s deep connection to the land.”  
**After:** “The building uses blue, green, and gold. The architect said the colours came from the surrounding landscape.”

### 9. Promotional language

Cut “breathtaking”, “world-class”, “must-see”, “nestled in the heart of”, “cutting-edge”, “unparalleled”, “iconic”, “stunning”, and “unique” unless the text proves the claim. Swap evaluation for a measurable quality or a specific feature.

### 10. Vague attribution

Avoid “experts say”, “analysts note”, “research suggests”, and “critics believe” without a named source. Give the source, present the statement as the author's view, or remove it.

### 11. Formulaic transitions

Delete “it is important to note”, “it should be emphasised”, “it is worth mentioning”, “it is essential to understand”, and “needless to say”. If it matters, say it.

### 12. “Challenges and opportunities” endings

Avoid stock paragraphs that start with “despite its successes, it faces challenges” and end with a vague promise. Name the problem, its cause, timing, and what happens next.

### 13. Negative parallelism

Do not use “not just X, but Y”, “not only X, but also Y”, “this is not merely”, or “no X, no Y, only Z”. Split the thought into direct sentences.

**Before:** “This is not just a tool; it is a philosophy. It not only speeds up work but also changes how people think.”  
**After:** “The tool speeds up work. It also changes how people plan it.”

### 14. The rule of three

Do not group three adjectives or benefits merely for cadence. Keep only claims that carry distinct information.

### 15. Synonym cycling

Do not call one person “the protagonist”, “the central figure”, “the main character”, and “the hero” in adjacent sentences. Repetition is often clearer.

### 16. False ranges

Avoid “from X to Y” when X and Y are not points on a scale.

**Before:** “From data analysis to strategic planning, from marketing to sales, we offer complete solutions.”  
**After:** “We analyse data, plan strategy, market products, and support sales.”

### 17. Sycophancy

Remove “Great question”, “You are absolutely right”, “Excellent observation”, and similar praise. Answer the question.

### 18. Chatbot residue

Remove “I hope this helps”, “Let me know if you need anything else”, “Happy to help”, “Here is a quick overview”, “as of my last update”, and “based on the information available”.

### 19. Excessive hedging

Cut stacks such as “it may perhaps be possible to suggest that this could potentially have some impact.” Keep only the uncertainty that the evidence requires.

### 20. Generic positive conclusions

Delete “the future looks bright”, “exciting times lie ahead”, “a step in the right direction”, and “continues to thrive”. End with a real consequence, next step, or fact.

### 21. Emojis and excessive formatting

Remove emojis from headings and lists unless the audience expects them. Do not bold every key phrase. Do not repeat a heading in the line below it. Strip tracking parameters from links when possible.

### 22. Stop phrases and intensifiers

Check “in today’s world”, “at this point in time”, “it goes without saying”, “needless to say”, “in the modern era”, “everyone knows”, plus “very”, “really”, “extremely”, “absolutely”, “truly”, and “incredibly”. If deleting the word changes nothing, delete it.

### 23. Maths and code symbols in prose

Write them out. “A = B” becomes “A is B”. “A → B” becomes “A leads to B”. “A > B” becomes “A matters more than B”. “A + B” becomes “A and B”. “A vs B” becomes “A compared with B”.

### 24. Unexplained technical jargon

Words such as “iterate”, “validate”, “optimise”, “scope”, “default”, “binary”, “random”, “relevant”, “pattern”, “feature”, “use case”, “workflow”, and “onboarding” can be right, but explain or replace them for a general audience. Write for a smart twelve-year-old without talking down to them.

### 25. Pseudo-depth

Cut “at its core”, “the real question is”, “fundamentally”, “if we dig deeper”, “in essence”, and “at the end of the day” when they only announce an ordinary point.

### 26. Announcing instead of explaining

Delete “let’s dive in”, “let’s unpack this”, “here is what you need to know”, “without further ado”, and “now let’s look at”. Start with the information.

### 27. Choppy drama

One short sentence can create emphasis. Several in a row sound like a trailer. Join fragments into complete thoughts.

### 28. Poster aphorisms

Avoid “X is the new Y”, “X is the language of Y”, “X is the currency of Y”, “architecture of trust”, and “X is not a tool, it is a mirror”. Explain the actual claim.

### 29. Fake intimacy

Avoid “Honestly?”, “Listen”, “Let’s be honest”, “Here is the thing”, and “To be frank” before a routine point. Leave them only when they are clearly the author's real voice.

### 30. Heading plus restatement

If the first line after a heading simply repeats it, delete that line and begin with a fact or argument.

### 31. Summary conclusions

Do not end with “In conclusion”, “To summarise”, “Overall”, “In short”, or “Thus” if the paragraph only repeats the text. End with something new or stop.

### 32. Filling factual gaps with guesses

Never use “probably”, “presumably”, “reportedly”, “it seems”, or “little is known” to smuggle in plausible invention. Say that the information is unavailable, cite a source, or remove the sentence.

## Style and formatting

- Use lively professional English, not a press release.
- Vary sentence length and structure naturally.
- One sentence should normally carry one thought. One paragraph should develop one topic.
- Keep technical terms when they earn their place; define them on first use for non-specialists.
- Use sentence case for headings.
- Use minimal bolding.
- Use double quotation marks for quotations unless the user or publication has a house style.

## Do not touch

Do not rewrite quotations, titles, names, or concrete odd details. Do not smooth out mixed feelings, self-corrections, parenthetical doubts, or digressions that belong to the writer's voice. Dry prose with no AI-pattern clusters is simply dry prose; do not decorate it for sport.

## Process

1. Read the text and identify its genre, audience, and tone.
2. Find clusters of patterns, not isolated words without context.
3. Rewrite weak passages without changing facts.
4. Check paragraphs. Put the main point early and remove paragraphs that add nothing.
5. Read the result aloud in your head.
6. Scan again for hard bans, especially negative parallelism, em dashes, and code symbols.

## Output format

1. Return the edited English text.
2. Optionally add a short note on the main changes.

## Full example

**Before:**

> It is important to note that, in today’s rapidly evolving digital landscape, digital transformation represents a pivotal driver of business growth. The implementation of innovative solutions enables organisations to achieve significant results in the area of operational efficiency. Our company is a market leader that provides high-quality services. Clients consistently praise our professionalism, reliability, and customer-centric approach.
>
> We hope this information was helpful. Please let us know if you have any questions.

**After:**

> We automate business processes. In 2025, we set up CRM systems for 40 companies. On average, they spent 30 percent less time on routine work.
>
> Seven in ten clients come back for another project.

**What changed:**

- Cut corporate wording and empty praise.
- Replaced general claims with concrete numbers.
- Removed chatbot sign-off and redundant conclusion.
- Kept the meaning without inventing details.
