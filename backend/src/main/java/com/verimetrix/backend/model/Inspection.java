package com.verimetrix.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;

@Entity
@Table(name = "inspections")
public class Inspection {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @Column(nullable=false, unique=true, length=32) private String inspectionCode;
  @Column(nullable=false) private String productName;
  @Column(nullable=false) private String category;
  private String contextType;
  private String originType;
  @Column(nullable=false) private String status = "CREATED";
  @Column(nullable=false, updatable=false) private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();
  @OneToMany(mappedBy="inspection", cascade=CascadeType.ALL, orphanRemoval=true) @OrderBy("id") private List<InspectionImage> images = new ArrayList<>();
  @OneToMany(mappedBy="inspection", cascade=CascadeType.ALL, orphanRemoval=true) @OrderBy("id") private List<RuleResult> results = new ArrayList<>();
  @PreUpdate void updated() { updatedAt = Instant.now(); }
  public Long getId(){return id;} public String getInspectionCode(){return inspectionCode;} public void setInspectionCode(String v){inspectionCode=v;}
  public String getProductName(){return productName;} public void setProductName(String v){productName=v;} public String getCategory(){return category;} public void setCategory(String v){category=v;}
  public String getContextType(){return contextType;} public void setContextType(String v){contextType=v;} public String getOriginType(){return originType;} public void setOriginType(String v){originType=v;}
  public String getStatus(){return status;} public void setStatus(String v){status=v;} public Instant getCreatedAt(){return createdAt;} public List<InspectionImage> getImages(){return images;} public List<RuleResult> getResults(){return results;}
}
