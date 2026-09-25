package com.verimetrix.backend.model;
import jakarta.persistence.*;
@Entity @Table(name="rule_results") public class RuleResult {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="inspection_id", nullable=false) private Inspection inspection;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="image_id") private InspectionImage image;
 @Column(nullable=false) private String ruleId; @Column(nullable=false) private String fieldName; @Column(nullable=false) private String status;
 @Lob private String extractedValue; @Lob private String evidenceText; private Double confidence; private String evidenceBoundingBox;
 private boolean needsInspectorReview; private String reviewAction; @Lob private String correctedValue; @Lob private String reviewNote; private String reviewedBy; private java.time.Instant reviewedAt;
 public Long getId(){return id;} public Inspection getInspection(){return inspection;} public void setInspection(Inspection v){inspection=v;} public InspectionImage getImage(){return image;} public void setImage(InspectionImage v){image=v;}
 public String getRuleId(){return ruleId;} public void setRuleId(String v){ruleId=v;} public String getFieldName(){return fieldName;} public void setFieldName(String v){fieldName=v;} public String getStatus(){return status;} public void setStatus(String v){status=v;} public String getExtractedValue(){return extractedValue;} public void setExtractedValue(String v){extractedValue=v;} public String getEvidenceText(){return evidenceText;} public void setEvidenceText(String v){evidenceText=v;} public Double getConfidence(){return confidence;} public void setConfidence(Double v){confidence=v;} public String getEvidenceBoundingBox(){return evidenceBoundingBox;} public void setEvidenceBoundingBox(String v){evidenceBoundingBox=v;} public boolean isNeedsInspectorReview(){return needsInspectorReview;} public void setNeedsInspectorReview(boolean v){needsInspectorReview=v;}
 public String getReviewAction(){return reviewAction;} public void setReviewAction(String v){reviewAction=v;} public String getCorrectedValue(){return correctedValue;} public void setCorrectedValue(String v){correctedValue=v;} public String getReviewNote(){return reviewNote;} public void setReviewNote(String v){reviewNote=v;} public String getReviewedBy(){return reviewedBy;} public void setReviewedBy(String v){reviewedBy=v;} public java.time.Instant getReviewedAt(){return reviewedAt;} public void setReviewedAt(java.time.Instant v){reviewedAt=v;}
}
