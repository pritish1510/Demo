package com.verimetrix.backend.model;
import jakarta.persistence.*;
@Entity @Table(name="inspection_images") public class InspectionImage {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="inspection_id", nullable=false) private Inspection inspection;
 @Column(nullable=false) private String fileName; @Column(nullable=false) private String storedName;
 public Long getId(){return id;} public Inspection getInspection(){return inspection;} public void setInspection(Inspection v){inspection=v;} public String getFileName(){return fileName;} public void setFileName(String v){fileName=v;} public String getStoredName(){return storedName;} public void setStoredName(String v){storedName=v;}
}
