# ruff: noqa: RUF001
# The system prompts contain quote characters that Ruff flags.

import os
from collections.abc import Generator

import dyad
import requests
from pydantic import BaseModel


@dyad.tool(description="Answers questions")
def bible_answer(
    context: dyad.AgentContext, output: dyad.Content, *, query: str
):
    """
    Used to answer questions based on the bible.
    """
    acc = ""
    for chunk in context.stream_chunks(
        system_prompt=SYSTEM_PROMPT, input=query
    ):
        if chunk.type == "text":
            acc += chunk.text
        output.append_chunk(chunk)
        yield

    return acc


class BibleVerseReference(BaseModel):
    book: str
    chapter: int
    start_verse: int
    end_verse: int


class BibleVerseReferences(BaseModel):
    verses: list[BibleVerseReference]


class BibleVerse(BaseModel):
    ref: str
    text: str


ESV_API_KEY = os.environ.get("ESV_API_KEY")
if not ESV_API_KEY:
    raise ValueError("ESV_API_KEY environment variable not set.")


def get_esv_text_batch(
    references: list[BibleVerseReference],
) -> list[BibleVerse]:
    """
    Fetches bible verse texts from the ESV API in a batch.
    """
    query_string = ""
    for ref in references:
        if ref.start_verse == ref.end_verse:
            query_string += f"{ref.book}+{ref.chapter}:{ref.start_verse},"
        else:
            query_string += (
                f"{ref.book}+{ref.chapter}:{ref.start_verse}-{ref.end_verse},"
            )
    query_string = query_string.rstrip(",")  # Remove trailing comma

    url = f"https://api.esv.org/v3/passage/text/?q={query_string}&include-passage-references=false&include-verse-numbers=false&include-first-verse-numbers=false&include-footnotes=false&include-footnote-body=false&include-headings=false&include-short-copyright=false&indent-paragraphs=0"
    headers = {"Authorization": f"Token {ESV_API_KEY}"}
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        passages = data.get("passages", [])
        passage_meta = data.get("passage_meta", [])

        bible_verses = []
        for i, passage in enumerate(passages):
            ref_string = passage_meta[i]["canonical"]
            bible_verses.append(
                BibleVerse(
                    ref=ref_string,
                    text=passage.strip(),
                )
            )
        return bible_verses
    except requests.exceptions.RequestException as e:
        print(f"Error fetching verses: {e}")
        return [
            BibleVerse(
                ref=f"{ref.book} {ref.chapter}:{ref.start_verse}-{ref.end_verse}",
                text="Verse not found.",
            )
            for ref in references
        ]


@dyad.tool(description="Get bible verse references and fetch the verse text")
def get_bible_verses(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    input: str,
) -> Generator[None, None, list[BibleVerse]]:
    """
    Used to get all the bible verses from the input so far and fetch the verse text.
    """
    bible_verse_references = None
    for obj in context.stream_structured_output(
        BibleVerseReferences,
        input=input,
        system_prompt="""
I want you to extract all the bible verses from the input. Retrieve them *EXACTLY*
as they are shown. Do not merge verses or change the verse ranges AT ALL.

Here's an example:

<input>

Romans 8 is one of the most significant chapters in the New Testament, often called the "Great Eight" for its profound theological content. Let me break down its main themes:

Freedom from Condemnation (verses 1-4)
The chapter opens with the declaration "There is therefore now no condemnation for those who are in Christ Jesus"
It establishes that believers are freed from the law of sin and death through Christ
Life in the Spirit vs. Life in the Flesh (verses 5-11)
Contrasts those who live according to the Spirit versus those who live according to the flesh
Emphasizes that the Spirit of God dwells in believers
Links the indwelling Spirit with resurrection life
Adoption and Assurance (verses 12-17)
Believers are adopted as children of God
The Spirit testifies to our adoption
We become co-heirs with Christ
Future Glory and Present Suffering (verses 18-25)
Present sufferings are not comparable to future glory
Creation itself awaits redemption
Hope in what is unseen
The Spirit's Intercession (verses 26-27)
The Spirit helps us in our weakness
Intercedes for us according to God's will
God's Sovereign Purpose (verses 28-30)
The famous verse "All things work together for good" (v.28)
The golden chain of salvation: foreknowledge, predestination, calling, justification, glorification
God's Unbreakable Love (verses 31-39)
Nothing can separate believers from God's love
Lists various challenges (tribulation, distress, persecution, etc.)
Affirms complete victory through Christ
</input>

<output>
{
  "verses": [
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 1,
      "end_verse": 4
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 5,
      "end_verse": 11
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 12,
      "end_verse": 17
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 18,
      "end_verse": 25
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 26,
      "end_verse": 27
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 28,
      "end_verse": 30
    },
    {
      "book": "Romans",
      "chapter": 8,
      "start_verse": 31,
      "end_verse": 39
    }
  ]
}
</output>
""",
    ):
        bible_verse_references = obj
        output.set_text("Bible verses: " + str(obj))
        yield
    if bible_verse_references is None:
        output.append_chunk(
            dyad.ErrorChunk(message="Structured output call failed")
        )
        yield
        return []
    return get_esv_text_batch(bible_verse_references.verses)


def render(content: dyad.Content):
    data = content.data_of(BibleOutput)
    citations = {}
    for verse in data.bible_verses:
        citations[verse.ref] = dyad.Citation(
            title=verse.ref, description=verse.text
        )
    dyad.markdown(data.text, citations=citations)


class BibleOutput(BaseModel):
    text: str
    bible_verses: list[BibleVerse]


@dyad.tool(description="Check the accuracy of the answer", render=render)
def check_accuracy(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    input: str,
    bible_verses: list[BibleVerse],
):
    # child = dyad.Content()
    # output.add_child(child)
    acc = ""
    for chunk in context.stream_chunks(
        system_prompt="""
        I want you to check the accuracy of the answer based on the bible verses supplied below.
        Be careful the input can contain inaccurate citations of bible verses.

        If there is no accuracy then I want you to restate the input using the bible verses supplied.

        I want you to format the bible verses using brackets:

        <example>
        The answer to this question is supported in [Revelation 1:1-3] and [Genesis 1:1].
        </example>

        IF you want to cite multiple passages do it like this:
        <example>
        This is supported by multiple passages [Revelation 1:1-3] [Genesis 1:1].
        </example>

        Do NOT merge multiple passages into one set of brackets.

        The actual answer should be *DETAILED* and *ACCURATE* based on the bible verses supplied.
        Do NOT use any bible verses EXCEPT for the ones supplied below in the Bible Verses section.

        Here's an example of an excellent response, both thorough and accurate and appropriately formatted:

        ### An In-Depth Exploration of Romans 8

Romans 8 is one of the most profound and theologically rich chapters in the New Testament, often regarded as the pinnacle of the Apostle Paul’s epistle to the Romans. Written to a mixed audience of Jewish and Gentile believers in Rome, this chapter encapsulates the essence of the Christian life—freedom from condemnation, the transformative power of the Holy Spirit, and the unshakeable hope of glory. It flows naturally from the preceding chapters, where Paul establishes humanity’s universal need for salvation [Romans 3:23], the provision of justification through faith in Christ [Romans 5:1], and the believer’s struggle with sin [Romans 7:15-20]. Romans 8 then emerges as a triumphant declaration of the gospel’s power to liberate and sustain believers, offering a deep well of encouragement and theological insight.

Below, I’ll break down Romans 8 into its key themes, weaving together biblical exegesis and theological reflection.

---

#### 1. Freedom from Condemnation through the Spirit (Romans 8:1-11)
The chapter opens with a resounding declaration: *“There is therefore now no condemnation for those who are in Christ Jesus”* [Romans 8:1]. This is the heartbeat of the gospel—Christ’s atoning work has nullified the penalty of sin for those united to Him by faith. Paul ties this freedom to the *“law of the Spirit of life”* which has set believers free from *“the law of sin and death”* [Romans 8:2]. The “law” here isn’t merely the Mosaic Law but the operative principle or power at work. Sin and death once reigned over humanity, but the Spirit’s life-giving presence has broken that dominion.

Paul explains how this was accomplished: God sent His Son *“in the likeness of sinful flesh and for sin”* to condemn sin in the flesh [Romans 8:3]. This echoes the incarnation and atonement—Jesus took on human nature, yet without sin, and through His death satisfied God’s righteous demands, something the Law could never achieve due to human weakness [Romans 8:3-4]. The result? Believers can now *“walk not according to the flesh but according to the Spirit”* [Romans 8:4], living in a new reality empowered by God’s indwelling presence.

Theologically, this section underscores the Trinitarian nature of salvation: the Father initiates, the Son accomplishes, and the Spirit applies. The Spirit is no mere force but a person who *“dwells in you”* [Romans 8:11], guaranteeing resurrection life—proof that the Christian’s future is secure because the same power that raised Christ will raise us.

---

#### 2. The Spirit-Led Life and Adoption as God’s Children (Romans 8:12-17)
Paul shifts to the practical implications of this freedom: believers are *“debtors, not to the flesh, to live according to the flesh”* [Romans 8:12], but to the Spirit. The flesh leads to death, but *“if by the Spirit you put to death the deeds of the body, you will live”* [Romans 8:13]. This is a call to sanctification—a daily, Spirit-empowered battle against sin.

Yet, this life is not mere duty; it is relational. Those led by the Spirit are *“sons of God”* [Romans 8:14], adopted into His family. The Spirit testifies with our spirit that we are *“children of God”* [Romans 8:16], and Paul introduces the intimate Aramaic term *“Abba, Father”* [Romans 8:15]—a cry of dependence and affection mirroring Jesus’ own prayer [Mark 14:36]. Adoption here is a legal and experiential reality: we are no longer slaves to fear but heirs of God, co-heirs with Christ [Romans 8:17]. However, this inheritance comes with a condition—*“if indeed we suffer with Him”*—linking our present struggles to future glory.

Theologically, this reveals the Spirit’s role in assurance and identity. Adoption is not a secondary status but the core of our relationship with God, elevating believers to a position of privilege and intimacy that surpasses even the angels.

---

#### 3. The Hope of Glory Amid Present Suffering (Romans 8:18-30)
Paul then addresses the tension of the Christian life: present suffering versus future glory. He boldly asserts, *“For I consider that the sufferings of this present time are not worth comparing with the glory that is to be revealed to us”* [Romans 8:18]. This glory isn’t just for us—it’s cosmic. Creation itself, subjected to futility because of human sin [Genesis 3:17-19], *“waits with eager longing”* for the revelation of God’s children [Romans 8:19-21]. When believers are glorified, creation will be *“set free from its bondage to corruption”* [Romans 8:21], a stunning vision of redemption’s scope.

In the meantime, we *“groan inwardly”* with creation, awaiting *“the redemption of our bodies”* [Romans 8:23]. The Spirit aids us in this waiting, interceding *“with groanings too deep for words”* [Romans 8:26] when we don’t know how to pray. This intercession, alongside Christ’s [Romans 8:34], assures us that our weaknesses don’t derail God’s plan.

The climax of this section is the famous *“golden chain”* of salvation: *“And we know that for those who love God all things work together for good, for those who are called according to His purpose”* [Romans 8:28]. Paul then outlines God’s sovereign process—foreknown, predestined, called, justified, glorified [Romans 8:29-30]—a sequence so certain that Paul speaks of glorification in the past tense, emphasizing its inevitability. Theologically, this affirms God’s providence and predestination, not as fatalism, but as a comfort: nothing can thwart His purpose to conform us to Christ’s image [Romans 8:29].

---

#### 4. The Unassailable Love of God (Romans 8:31-39)
The chapter closes with a rhetorical flourish, celebrating the security of the believer. *“If God is for us, who can be against us?”* [Romans 8:31]. Paul points to God’s ultimate proof of love: He *“did not spare His own Son but gave Him up for us all”* [Romans 8:32]. If God has already given the greatest gift, how will He not provide everything else?

No accusation can stand—God justifies [Romans 8:33]. No condemnation can stick—Christ intercedes [Romans 8:34]. No force—tribulation, distress, or even death—can separate us from *“the love of God in Christ Jesus our Lord”* [Romans 8:38-39]. Paul lists cosmic and spiritual powers, heights and depths, yet none can sever this bond. This is the capstone of Romans 8: our security rests not in our strength but in God’s unchangeable love.

Theologically, this section magnifies the doctrines of perseverance and assurance. Believers are not immune to trials, but they are invincible in Christ’s love—a love that pursues, protects, and preserves to the end.

---

### Conclusion: The Theological Richness of Romans 8
Romans 8 is a tapestry of grace, weaving together justification, sanctification, adoption, and glorification into a single, breathtaking narrative. It reveals the Triune God’s work: the Father’s plan, the Son’s sacrifice, and the Spirit’s presence. It confronts the despair of sin with the hope of resurrection, the ache of suffering with the promise of glory, and the fear of abandonment with the certainty of love. For the believer, it is both a theological anchor and a spiritual anthem—a reminder that, in Christ, we are more than conquerors [Romans 8:37].

This chapter invites us to live boldly, pray confidently, and hope unswervingly, knowing that our story is caught up in God’s eternal purpose. As theologian N.T. Wright aptly notes, Romans 8 is “the music of the gospel”—a melody that resounds through time, calling us to trust and worship the God who is for us.
        """,
        input=f"""
Input: {input}

Bible Verses: {bible_verses}
""",
    ):
        if chunk.type == "text":
            acc += chunk.text
        output.set_data(BibleOutput(text=acc, bible_verses=bible_verses))
        yield


def bible_scholar_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    while True:
        step = yield from context.stream_step(
            tools=[bible_answer, get_bible_verses]
        )
        if step.type == "error":
            return
        if step.type == "tool_call":
            if step.is_tool(bible_answer):
                if not isinstance(step.return_value, str):
                    raise ValueError(
                        "Expected a string return value, got: "
                        + str(step.return_value)
                    )
                output = yield from context.call_tool(
                    get_bible_verses,
                    input=step.return_value,
                )
                yield from context.call_tool(
                    check_accuracy, input=step.return_value, bible_verses=output
                )
                return

        if step.type == "default":
            yield from context.stream_to_content(system_prompt=SYSTEM_PROMPT)
            return


SYSTEM_PROMPT = """
Answer every question thoughtfully, grounding your responses in relevant Bible verses interpreted through a Reformed theological perspective. 
Draw upon historical insights from the early Church Fathers and key Reformation thinkers to provide context and depth. 
Ensure all answers are biblically sound, doctrinally consistent with Reformed theology, and presented with clarity and humility.


Here's an example of a high-quality response:

<example>
Romans 8 is one of the most profound and theologically rich chapters in the New Testament, often considered the pinnacle of Paul’s epistle to the Romans. Written by the Apostle Paul around AD 55-57, it encapsulates the heart of the gospel, offering a sweeping vision of the Christian life rooted in the transformative power of the Holy Spirit, the assurance of God’s love, and the ultimate hope of glory. Below, I’ll break it down into key thematic sections with insights drawn from biblical theology, supported by the text itself.

---

### **1. Life in the Spirit (Romans 8:1-17)**  
#### *No Condemnation and the Spirit’s Empowerment*
The chapter opens with a triumphant declaration:  
> “There is therefore now no condemnation for those who are in Christ Jesus” (Romans 8:1, ESV).  

This sets the tone for the entire chapter. After Romans 7’s struggle with sin and the law’s inability to deliver, Paul shifts to the liberating reality of the gospel. The phrase “in Christ Jesus” is central—believers are united with Christ, and His righteousness has freed them from the penalty and power of sin. The “law of the Spirit of life” has overcome the “law of sin and death” (v. 2), pointing to the Holy Spirit’s active role in the believer’s life.

Theologically, this reflects the transition from the old covenant (where the law exposed sin but couldn’t conquer it) to the new covenant, where the Spirit indwells believers, fulfilling the promise of Ezekiel 36:27: “I will put my Spirit within you, and cause you to walk in my statutes.” Verses 5-11 contrast the “mind set on the flesh” (leading to death) with the “mind set on the Spirit” (leading to life and peace), underscoring the Spirit’s transformative work in sanctification.

#### *Adoption as Sons*
A climactic moment comes in verses 14-17:  
> “For all who are led by the Spirit of God are sons of God… you have received the Spirit of adoption as sons, by whom we cry, ‘Abba! Father!’”  

This is a deeply relational theology. Adoption here isn’t merely legal; it’s experiential and familial. The Spirit testifies to our identity as God’s children, granting us intimacy with the Father (echoing Jesus’ own cry in Mark 14:36). This sonship also ties to inheritance—believers are “heirs of God and fellow heirs with Christ” (v. 17), a promise rooted in the redemptive work of Christ as the firstborn Son (cf. Colossians 1:15).

---

### **2. Hope Amid Suffering (Romans 8:18-30)**  
#### *Groaning for Glory*
Paul then addresses the tension of the “already but not yet” in the Christian life:  
> “For I consider that the sufferings of this present time are not worth comparing with the glory that is to be revealed to us” (v. 18).  

Here, he expands the scope to cosmic redemption. Creation itself “groans” under the curse of sin (v. 22), awaiting liberation when God’s children are revealed in glory. This echoes Genesis 3’s fall and anticipates Revelation 21-22’s new creation. Believers, too, groan inwardly, longing for the “redemption of our bodies” (v. 23)—the resurrection, a cornerstone of Christian hope.

#### *The Spirit’s Intercession and God’s Providence*
In suffering, the Spirit aids us:  
> “Likewise the Spirit helps us in our weakness. For we do not know what to pray for as we ought, but the Spirit himself intercedes for us with groanings too deep for words” (v. 26).  

This is a profound Trinitarian insight—the Spirit intercedes, aligning our prayers with God’s will, while Christ also intercedes at the Father’s right hand (v. 34). Verses 28-30 then unveil God’s sovereign plan:  
> “And we know that for those who love God all things work together for good, for those who are called according to his purpose.”  

The “golden chain” of salvation follows—foreknown, predestined, called, justified, glorified—demonstrating God’s unbreakable purpose from eternity past to eternity future. Theologically, this affirms both divine sovereignty and human responsibility, a tension Paul doesn’t resolve but celebrates.

---

### **3. The Triumph of God’s Love (Romans 8:31-39)**  
#### *Unshakable Assurance*
The chapter crescendos with rhetorical questions that affirm the believer’s security:  
> “If God is for us, who can be against us? He who did not spare his own Son but gave him up for us all, how will he not also with him graciously give us all things?” (vv. 31-32).  

This is the logic of the gospel: God’s love, proven in Christ’s sacrifice, guarantees every spiritual blessing. Paul lists potential threats—tribulation, persecution, even death—but declares:  
> “No, in all these things we are more than conquerors through him who loved us” (v. 37).  

#### *Nothing Can Separate Us*
The final verses (38-39) are a poetic and theological masterpiece:  
> “For I am sure that neither death nor life, nor angels nor rulers, nor things present nor things to come… nor anything else in all creation, will be able to separate us from the love of God in Christ Jesus our Lord.”  

This encapsulates the doctrine of eternal security. God’s love is not contingent on our performance but anchored in Christ’s finished work. Theologically, it reflects the perseverance of the saints, rooted in God’s unchanging nature (cf. Malachi 3:6) and covenant faithfulness.

---

### **Theological Significance**  
Romans 8 bridges justification (Romans 3-5) and sanctification (Romans 6-8), showing how the Spirit applies Christ’s work to believers’ lives. It’s Trinitarian through and through—the Father initiates salvation, the Son accomplishes it, and the Spirit applies it. It also offers a robust eschatology, linking present suffering to future glory, and a pastoral theology of comfort amid trials.

In the broader biblical narrative, Romans 8 fulfills Old Testament promises (e.g., the Spirit’s indwelling in Jeremiah 31:33-34) and anticipates the consummation of God’s kingdom. It’s a microcosm of the gospel: deliverance from sin, adoption into God’s family, and the unshakeable hope of eternal life.

---

### **Application**  
For believers today, Romans 8 is a wellspring of encouragement. It assures us that our struggles don’t define us—our identity in Christ does. It calls us to live by the Spirit, trust God’s providence, and rest in His invincible love. As John Stott wrote, “Romans 8 begins with no condemnation, ends with no separation, and in between offers no defeat.”

Does this resonate with what you were seeking? I’d be glad to dive deeper into any section!
</example>
"""
